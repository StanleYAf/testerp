import { Request, Response } from "express";
import { storage } from "../storage";
import { fivemService } from "../services/fivemService";
import { emailService } from "../services/emailService";
import { logger } from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import { CryptoUtils } from "../utils/crypto";

export const adminController = {
  // User management
  getUsers: asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20 } = req.query as any;

    const users = await storage.getAllUsers(Number(limit), (Number(page) - 1) * Number(limit));
    const totalUsers = await storage.getUserCount();

    const sanitizedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fivemIdentifier: user.fivemIdentifier,
      discordId: user.discordId,
      coins: user.coins,
      vipLevel: user.vipLevel,
      vipExpires: user.vipExpires,
      banned: user.banned,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    res.json({
      success: true,
      users: sanitizedUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalUsers,
        totalPages: Math.ceil(totalUsers / Number(limit))
      }
    });
  }),

  banUser: asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id);
    const { reason } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.banned) {
      return res.status(400).json({ error: "User is already banned" });
    }

    // Prevent banning other admins (unless super admin)
    if (user.role === "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Cannot ban other administrators" });
    }

    if (user.role === "super_admin") {
      return res.status(403).json({ error: "Cannot ban super administrators" });
    }

    // Ban the user
    await storage.updateUser(userId, { banned: true });

    // Kick from FiveM server if online
    if (user.fivemIdentifier) {
      try {
        await fivemService.kickPlayer(user.fivemIdentifier, `Banned: ${reason}`);
      } catch (error) {
        logger.warn("Failed to kick banned user from FiveM server", { error, userId });
      }
    }

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "user_banned",
      details: {
        bannedUserId: userId,
        bannedUsername: user.username,
        reason
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: "User banned successfully",
      user: {
        id: user.id,
        username: user.username,
        banned: true
      }
    });
  }),

  unbanUser: asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id);

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.banned) {
      return res.status(400).json({ error: "User is not banned" });
    }

    // Unban the user
    await storage.updateUser(userId, { banned: false });

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "user_unbanned",
      details: {
        unbannedUserId: userId,
        unbannedUsername: user.username
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: "User unbanned successfully",
      user: {
        id: user.id,
        username: user.username,
        banned: false
      }
    });
  }),

  grantItemsToUser: asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id);
    const { grantType, grantData, reason } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const grantId = CryptoUtils.generateUUID();

    // Create grant
    const grant = await storage.createGrant({
      id: grantId,
      userId,
      grantType,
      grantData,
      status: "pending",
      grantedBy: req.user.id
    });

    // Try to deliver immediately if user is online
    let delivered = false;
    if (user.fivemIdentifier) {
      try {
        const deliveryResult = await fivemService.deliverItems({
          userIdentifier: user.fivemIdentifier,
          grantType,
          grantData
        });

        if (deliveryResult.delivered) {
          await storage.updateGrant(grantId, { status: "delivered" });
          delivered = true;
        }
      } catch (error) {
        logger.error("Failed to deliver admin grant", { error, grantId });
      }
    }

    // Handle special grant types
    if (grantType === "coins") {
      const coinAmount = grantData.amount || 0;
      await storage.updateUser(userId, {
        coins: user.coins + coinAmount
      });
      delivered = true;
    }

    if (grantType === "vip") {
      const vipLevel = grantData.level || "bronze";
      const vipDuration = grantData.duration || 30;
      const vipExpires = new Date(Date.now() + vipDuration * 24 * 60 * 60 * 1000);

      await storage.updateUser(userId, {
        vipLevel,
        vipExpires
      });

      emailService.sendVipActivation(
        { username: user.username, email: user.email },
        vipLevel,
        vipExpires
      );
      delivered = true;
    }

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "admin_grant_created",
      details: {
        grantId,
        targetUserId: userId,
        targetUsername: user.username,
        grantType,
        grantData,
        reason,
        delivered
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: delivered ? "Items granted and delivered successfully" : "Items granted successfully (pending delivery)",
      grant: {
        id: grantId,
        grantType,
        grantData,
        status: delivered ? "delivered" : "pending",
        deliveredImmediately: delivered
      }
    });
  }),

  // Product management
  createProduct: asyncHandler(async (req: Request, res: Response) => {
    const productData = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Check if product code already exists
    const existingProduct = await storage.getProductByCode(productData.code);
    if (existingProduct) {
      return res.status(400).json({ error: "Product code already exists" });
    }

    const product = await storage.createProduct(productData);

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "product_created",
      details: {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        price: product.price,
        type: product.type
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product
    });
  }),

  updateProduct: asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.id);
    const updateData = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const existingProduct = await storage.getProduct(productId);
    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if code is being changed and if new code exists
    if (updateData.code && updateData.code !== existingProduct.code) {
      const codeExists = await storage.getProductByCode(updateData.code);
      if (codeExists) {
        return res.status(400).json({ error: "Product code already exists" });
      }
    }

    const updatedProduct = await storage.updateProduct(productId, updateData);

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "product_updated",
      details: {
        productId,
        oldData: existingProduct,
        newData: updateData
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct
    });
  }),

  deleteProduct: asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.id);

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const product = await storage.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const deleted = await storage.deleteProduct(productId);
    if (!deleted) {
      return res.status(500).json({ error: "Failed to delete product" });
    }

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "product_deleted",
      details: {
        productId,
        productCode: product.code,
        productName: product.name
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: "Product deleted successfully"
    });
  }),

  // Data access
  getTransactions: asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, status, userId } = req.query as any;

    const transactions = await storage.getAllTransactions(Number(limit), (Number(page) - 1) * Number(limit));
    
    let filteredTransactions = transactions;
    
    if (status) {
      filteredTransactions = filteredTransactions.filter(t => t.status === status);
    }
    
    if (userId) {
      filteredTransactions = filteredTransactions.filter(t => t.userId === Number(userId));
    }

    // Get user data for each transaction
    const transactionsWithUsers = await Promise.all(
      filteredTransactions.map(async (transaction) => {
        const user = await storage.getUser(transaction.userId);
        
        return {
          id: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          paymentMethod: transaction.paymentMethod,
          paymentId: transaction.paymentId,
          products: transaction.products,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          user: user ? {
            id: user.id,
            username: user.username,
            email: user.email
          } : null
        };
      })
    );

    res.json({
      success: true,
      transactions: transactionsWithUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: filteredTransactions.length
      }
    });
  }),

  getGrants: asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, status, userId } = req.query as any;

    // Get all grants (we'll implement pagination in storage later)
    const allGrants = await storage.getPendingGrants(); // This gets all grants, not just pending
    
    let filteredGrants = allGrants;
    
    if (status) {
      filteredGrants = filteredGrants.filter(g => g.status === status);
    }
    
    if (userId) {
      filteredGrants = filteredGrants.filter(g => g.userId === Number(userId));
    }

    // Apply pagination
    const startIndex = (Number(page) - 1) * Number(limit);
    const paginatedGrants = filteredGrants.slice(startIndex, startIndex + Number(limit));

    // Get user data for each grant
    const grantsWithUsers = await Promise.all(
      paginatedGrants.map(async (grant) => {
        const user = await storage.getUser(grant.userId);
        const grantedByUser = grant.grantedBy ? await storage.getUser(grant.grantedBy) : null;
        
        return {
          id: grant.id,
          transactionId: grant.transactionId,
          grantType: grant.grantType,
          grantData: grant.grantData,
          status: grant.status,
          grantedAt: grant.grantedAt,
          user: user ? {
            id: user.id,
            username: user.username,
            email: user.email,
            fivemIdentifier: user.fivemIdentifier
          } : null,
          grantedBy: grantedByUser ? {
            id: grantedByUser.id,
            username: grantedByUser.username
          } : null
        };
      })
    );

    res.json({
      success: true,
      grants: grantsWithUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: filteredGrants.length
      }
    });
  }),

  manualGrant: asyncHandler(async (req: Request, res: Response) => {
    const { userId, grantType, grantData, reason } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const grantId = CryptoUtils.generateUUID();

    // Create grant
    const grant = await storage.createGrant({
      id: grantId,
      userId,
      grantType,
      grantData,
      status: "pending",
      grantedBy: req.user.id
    });

    // Try to deliver immediately
    let delivered = false;
    if (user.fivemIdentifier) {
      try {
        const deliveryResult = await fivemService.deliverItems({
          userIdentifier: user.fivemIdentifier,
          grantType,
          grantData
        });

        if (deliveryResult.delivered) {
          await storage.updateGrant(grantId, { status: "delivered" });
          delivered = true;
        }
      } catch (error) {
        logger.error("Failed to deliver manual grant", { error, grantId });
      }
    }

    // Handle special grant types
    if (grantType === "coins") {
      const coinAmount = grantData.amount || 0;
      await storage.updateUser(userId, {
        coins: user.coins + coinAmount
      });
      delivered = true;
    }

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "manual_grant_created",
      details: {
        grantId,
        targetUserId: userId,
        grantType,
        grantData,
        reason,
        delivered
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: delivered ? "Grant created and delivered successfully" : "Grant created successfully (pending delivery)",
      grant: {
        id: grantId,
        grantType,
        grantData,
        status: delivered ? "delivered" : "pending",
        reason,
        deliveredImmediately: delivered
      }
    });
  }),

  // Analytics
  getAnalytics: asyncHandler(async (req: Request, res: Response) => {
    const { period = "month", startDate, endDate } = req.query as any;

    // Get basic stats
    const userCount = await storage.getUserCount();
    const productCount = await storage.getProductCount();
    const transactionStats = await storage.getTransactionStats();

    // Get all transactions for detailed analytics
    const allTransactions = await storage.getAllTransactions(10000, 0);
    
    // Filter by date range if provided
    let filteredTransactions = allTransactions;
    if (startDate) {
      const start = new Date(startDate);
      filteredTransactions = filteredTransactions.filter(t => 
        new Date(t.createdAt) >= start
      );
    }
    if (endDate) {
      const end = new Date(endDate);
      filteredTransactions = filteredTransactions.filter(t => 
        new Date(t.createdAt) <= end
      );
    }

    // Calculate analytics
    const approvedTransactions = filteredTransactions.filter(t => t.status === "approved");
    const pendingTransactions = filteredTransactions.filter(t => t.status === "pending");
    const failedTransactions = filteredTransactions.filter(t => t.status === "failed");

    const totalRevenue = approvedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const averageOrderValue = approvedTransactions.length > 0 ? totalRevenue / approvedTransactions.length : 0;

    // Group by payment method
    const paymentMethods = approvedTransactions.reduce((acc: Record<string, any>, t) => {
      const method = t.paymentMethod || "unknown";
      if (!acc[method]) {
        acc[method] = { count: 0, revenue: 0 };
      }
      acc[method].count++;
      acc[method].revenue += t.amount;
      return acc;
    }, {});

    // Group by date for charts
    const dailyStats = approvedTransactions.reduce((acc: Record<string, any>, t) => {
      const date = new Date(t.createdAt).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { transactions: 0, revenue: 0 };
      }
      acc[date].transactions++;
      acc[date].revenue += t.amount;
      return acc;
    }, {});

    // Top products (from transaction data)
    const productSales: Record<string, any> = {};
    approvedTransactions.forEach(t => {
      try {
        const products = JSON.parse(t.products || "[]");
        products.forEach((p: any) => {
          if (!productSales[p.productId]) {
            productSales[p.productId] = {
              productId: p.productId,
              name: p.name,
              sales: 0,
              revenue: 0,
              quantity: 0
            };
          }
          productSales[p.productId].sales++;
          productSales[p.productId].revenue += p.subtotal || (p.price * p.quantity);
          productSales[p.productId].quantity += p.quantity;
        });
      } catch (error) {
        // Skip invalid product data
      }
    });

    const topProducts = Object.values(productSales)
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .slice(0, 10);

    res.json({
      success: true,
      analytics: {
        period,
        dateRange: {
          start: startDate || null,
          end: endDate || null
        },
        overview: {
          totalUsers: userCount,
          totalProducts: productCount,
          totalTransactions: filteredTransactions.length,
          approvedTransactions: approvedTransactions.length,
          pendingTransactions: pendingTransactions.length,
          failedTransactions: failedTransactions.length,
          totalRevenue,
          averageOrderValue,
          conversionRate: filteredTransactions.length > 0 ? 
            (approvedTransactions.length / filteredTransactions.length) * 100 : 0
        },
        paymentMethods,
        dailyStats,
        topProducts,
        trends: {
          // Simple trend calculation (could be more sophisticated)
          transactionGrowth: filteredTransactions.length,
          revenueGrowth: totalRevenue
        }
      }
    });
  }),

  getLogs: asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 50, userId, action } = req.query as any;

    let logs = await storage.getActivityLogs(
      userId ? Number(userId) : undefined, 
      Number(limit) * Number(page)
    );

    if (action) {
      logs = logs.filter(log => log.action === action);
    }

    // Apply pagination
    const startIndex = (Number(page) - 1) * Number(limit);
    const paginatedLogs = logs.slice(startIndex, startIndex + Number(limit));

    // Get user data for each log
    const logsWithUsers = await Promise.all(
      paginatedLogs.map(async (log) => {
        const user = log.userId ? await storage.getUser(log.userId) : null;
        
        return {
          id: log.id,
          action: log.action,
          details: log.details,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          createdAt: log.createdAt,
          user: user ? {
            id: user.id,
            username: user.username,
            email: user.email
          } : null
        };
      })
    );

    res.json({
      success: true,
      logs: logsWithUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: logs.length
      }
    });
  })
};
