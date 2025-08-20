import { Request, Response } from "express";
import { storage } from "../storage";
import { efiService } from "../services/efiService";
import { emailService } from "../services/emailService";
import { logger } from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import { CryptoUtils } from "../utils/crypto";

export const paymentController = {
  createPayment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { items, paymentMethod = "pix" } = req.body;

    // Validate cart items
    const cartProducts = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = await storage.getProduct(item.productId);
      if (!product) {
        return res.status(404).json({ 
          error: `Product with ID ${item.productId} not found` 
        });
      }

      if (!product.active) {
        return res.status(400).json({ 
          error: `Product ${product.name} is not available` 
        });
      }

      // Check stock
      if (product.stock !== -1 && product.stock < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}` 
        });
      }

      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;

      cartProducts.push({
        productId: product.id,
        code: product.code,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: itemTotal,
        type: product.type,
        data: product.data
      });
    }

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    // Create transaction record
    const transactionId = CryptoUtils.generateUUID();
    const transaction = await storage.createTransaction({
      id: transactionId,
      userId: req.user.id,
      amount: totalAmount,
      currency: "BRL",
      status: "pending",
      paymentMethod,
      products: JSON.stringify(cartProducts),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    });

    try {
      // Create PIX payment
      const paymentData = {
        amount: totalAmount,
        description: `FiveM Store - Order ${transactionId}`,
        externalId: transactionId,
        customer: {
          name: req.user.username,
          email: req.user.email
        }
      };

      const pixPayment = await efiService.createPixPayment(paymentData);

      // Update transaction with payment details
      await storage.updateTransaction(transactionId, {
        paymentId: pixPayment.paymentId,
        qrCode: pixPayment.qrCode,
        expiresAt: pixPayment.expiresAt
      });

      // Log activity
      await storage.logActivity({
        userId: req.user.id,
        action: "payment_created",
        details: {
          transactionId,
          amount: totalAmount,
          paymentMethod,
          itemCount: items.length
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });

      res.status(201).json({
        success: true,
        message: "Payment created successfully",
        payment: {
          id: transactionId,
          amount: totalAmount,
          currency: "BRL",
          status: "pending",
          paymentMethod,
          qrCode: pixPayment.qrCode,
          qrCodeImage: pixPayment.qrCodeImage,
          expiresAt: pixPayment.expiresAt,
          products: cartProducts
        }
      });

      // Clear cart after successful payment creation
      await storage.clearCart(req.user.id);

    } catch (error) {
      logger.error("Failed to create PIX payment", { error, transactionId });
      
      // Update transaction status to failed
      await storage.updateTransaction(transactionId, {
        status: "failed"
      });

      return res.status(500).json({
        error: "Failed to create payment",
        message: "Please try again later"
      });
    }
  }),

  getPayment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id: transactionId } = req.params;

    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Check if user owns this transaction or is admin
    if (transaction.userId !== req.user.id && !["admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Parse products
    let products = [];
    try {
      products = JSON.parse(transaction.products || "[]");
    } catch (error) {
      logger.error("Failed to parse transaction products", { transactionId, error });
    }

    res.json({
      success: true,
      payment: {
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        paymentId: transaction.paymentId,
        qrCode: transaction.qrCode,
        expiresAt: transaction.expiresAt,
        products,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    });
  }),

  getPaymentStatus: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id: transactionId } = req.params;

    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Check if user owns this transaction or is admin
    if (transaction.userId !== req.user.id && !["admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      // Check payment status with EfiBank if still pending
      if (transaction.status === "pending" && transaction.paymentId) {
        const paymentStatus = await efiService.getPaymentStatus(transaction.paymentId);
        
        if (paymentStatus.status !== transaction.status) {
          // Update transaction status
          await storage.updateTransaction(transactionId, {
            status: paymentStatus.status as any,
            updatedAt: new Date()
          });

          // If payment was approved, process the order
          if (paymentStatus.status === "approved") {
            // This would be handled by webhook in production, but we'll process here as backup
            await processApprovedPayment(transactionId);
          }

          transaction.status = paymentStatus.status as any;
        }
      }

      res.json({
        success: true,
        status: {
          transactionId: transaction.id,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentMethod: transaction.paymentMethod,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          expiresAt: transaction.expiresAt
        }
      });

    } catch (error) {
      logger.error("Failed to check payment status", { error, transactionId });
      
      res.json({
        success: true,
        status: {
          transactionId: transaction.id,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentMethod: transaction.paymentMethod,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          expiresAt: transaction.expiresAt
        }
      });
    }
  }),

  cancelPayment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id: transactionId } = req.params;

    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Check if user owns this transaction or is admin
    if (transaction.userId !== req.user.id && !["admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ 
        error: "Payment cannot be cancelled",
        currentStatus: transaction.status
      });
    }

    try {
      // Cancel payment with EfiBank if needed
      if (transaction.paymentId) {
        await efiService.cancelPayment(transaction.paymentId);
      }

      // Update transaction status
      await storage.updateTransaction(transactionId, {
        status: "cancelled"
      });

      // Log activity
      await storage.logActivity({
        userId: req.user.id,
        action: "payment_cancelled",
        details: { transactionId },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });

      res.json({
        success: true,
        message: "Payment cancelled successfully",
        transactionId,
        status: "cancelled"
      });

    } catch (error) {
      logger.error("Failed to cancel payment", { error, transactionId });
      return res.status(500).json({
        error: "Failed to cancel payment",
        message: "Please try again later"
      });
    }
  })
};

// Helper function to process approved payments
async function processApprovedPayment(transactionId: string) {
  try {
    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) return;

    const user = await storage.getUser(transaction.userId);
    if (!user) return;

    // Parse products
    let products = [];
    try {
      products = JSON.parse(transaction.products || "[]");
    } catch (error) {
      logger.error("Failed to parse transaction products", { transactionId, error });
      return;
    }

    // Process each product in the order
    for (const product of products) {
      const grantId = CryptoUtils.generateUUID();
      
      await storage.createGrant({
        id: grantId,
        transactionId,
        userId: transaction.userId,
        grantType: product.type,
        grantData: {
          productId: product.productId,
          productName: product.name,
          quantity: product.quantity,
          data: product.data
        },
        status: "pending"
      });
    }

    // Send confirmation email
    emailService.sendPurchaseConfirmation(
      { username: user.username, email: user.email },
      { id: transactionId, amount: transaction.amount, paymentMethod: transaction.paymentMethod },
      products
    );

    logger.info("Payment processed successfully", { transactionId, userId: transaction.userId });

  } catch (error) {
    logger.error("Failed to process approved payment", { error, transactionId });
  }
}
