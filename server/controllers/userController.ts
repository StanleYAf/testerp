import { Request, Response } from "express";
import { storage } from "../storage";
import { logger } from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";

export const userController = {
  getUser: asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id);
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return public user data only
    const publicUser = {
      id: user.id,
      username: user.username,
      vipLevel: user.vipLevel,
      vipExpires: user.vipExpires,
      createdAt: user.createdAt
    };

    res.json({
      success: true,
      user: publicUser
    });
  }),

  searchUsers: asyncHandler(async (req: Request, res: Response) => {
    const { q: query, page = 1, limit = 20 } = req.query as any;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }

    // For simplicity, we'll get all users and filter (in production, use database search)
    const allUsers = await storage.getAllUsers(Number(limit), (Number(page) - 1) * Number(limit));
    
    const filteredUsers = allUsers
      .filter(user => 
        user.username.toLowerCase().includes(query.toLowerCase()) && 
        !user.banned
      )
      .map(user => ({
        id: user.id,
        username: user.username,
        vipLevel: user.vipLevel,
        createdAt: user.createdAt
      }));

    res.json({
      success: true,
      users: filteredUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: filteredUsers.length
      }
    });
  }),

  getUserStats: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = req.user.id;

    // Get user transactions
    const transactions = await storage.getUserTransactions(userId);
    const approvedTransactions = transactions.filter(t => t.status === "approved");
    
    // Get user grants
    const grants = await storage.getUserGrants(userId);
    const deliveredGrants = grants.filter(g => g.status === "delivered");

    // Calculate stats
    const totalSpent = approvedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalTransactions = transactions.length;
    const successfulDeliveries = deliveredGrants.length;

    // Get user data
    const user = await storage.getUser(userId);

    res.json({
      success: true,
      stats: {
        totalSpent,
        totalTransactions,
        successfulDeliveries,
        coins: user?.coins || 0,
        vipLevel: user?.vipLevel || "none",
        vipExpires: user?.vipExpires,
        memberSince: user?.createdAt
      }
    });
  }),

  getUserTransactions: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const transactions = await storage.getUserTransactions(req.user.id);

    res.json({
      success: true,
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        products: transaction.products,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }))
    });
  }),

  getUserGrants: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const grants = await storage.getUserGrants(req.user.id);

    res.json({
      success: true,
      grants: grants.map(grant => ({
        id: grant.id,
        grantType: grant.grantType,
        grantData: grant.grantData,
        status: grant.status,
        grantedAt: grant.grantedAt,
        transactionId: grant.transactionId
      }))
    });
  }),

  updateCoins: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { amount, operation = "add" } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let newCoins = user.coins;
    
    if (operation === "add") {
      newCoins += amount;
    } else if (operation === "subtract") {
      newCoins = Math.max(0, newCoins - amount);
    } else {
      return res.status(400).json({ error: "Invalid operation. Use 'add' or 'subtract'" });
    }

    const updatedUser = await storage.updateUser(req.user.id, { coins: newCoins });

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "coins_updated",
      details: { 
        operation, 
        amount, 
        previousCoins: user.coins, 
        newCoins 
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: `Coins ${operation}ed successfully`,
      coins: newCoins
    });
  }),

  getUserActivity: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { limit = 50 } = req.query as any;

    const activities = await storage.getActivityLogs(req.user.id, Number(limit));

    res.json({
      success: true,
      activities: activities.map(activity => ({
        action: activity.action,
        details: activity.details,
        createdAt: activity.createdAt,
        ipAddress: activity.ipAddress?.replace(/\.\d+$/, '.***') // Mask last octet for privacy
      }))
    });
  })
};
