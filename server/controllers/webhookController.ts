import { Request, Response } from "express";
import { storage } from "../storage";
import { efiService } from "../services/efiService";
import { fivemService } from "../services/fivemService";
import { emailService } from "../services/emailService";
import { logger } from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import { CryptoUtils } from "../utils/crypto";

export const webhookController = {
  handleEfiBankWebhook: asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["x-signature"] as string;
    const payload = req.body;

    logger.info("EfiBank webhook received", { 
      signature: signature?.substring(0, 10) + "...",
      payload: typeof payload === "string" ? payload.substring(0, 100) + "..." : payload
    });

    // Verify webhook signature
    if (!efiService.validateWebhookSignature(payload.toString(), signature)) {
      logger.warn("Invalid EfiBank webhook signature", { signature });
      return res.status(401).json({ error: "Invalid signature" });
    }

    try {
      // Parse webhook data
      const webhookData = efiService.parseWebhookData(JSON.parse(payload.toString()));
      
      logger.info("Processing EfiBank webhook", { webhookData });

      // Find transaction by payment ID
      const transactions = await storage.getAllTransactions(1000, 0);
      const transaction = transactions.find(t => t.paymentId === webhookData.paymentId);

      if (!transaction) {
        logger.warn("Transaction not found for webhook", { paymentId: webhookData.paymentId });
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Update transaction status
      await storage.updateTransaction(transaction.id, {
        status: webhookData.status as any,
        updatedAt: new Date()
      });

      // Log webhook activity
      await storage.logActivity({
        userId: transaction.userId,
        action: "webhook_received",
        details: {
          type: "efibank",
          transactionId: transaction.id,
          oldStatus: transaction.status,
          newStatus: webhookData.status,
          paymentId: webhookData.paymentId
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });

      // Process based on status
      if (webhookData.status === "approved" && transaction.status !== "approved") {
        await processApprovedPayment(transaction.id, transaction.userId);
      } else if (webhookData.status === "cancelled" || webhookData.status === "failed") {
        await processFailedPayment(transaction.id, transaction.userId, webhookData.status);
      }

      res.json({ 
        success: true,
        message: "Webhook processed successfully",
        transactionId: transaction.id
      });

    } catch (error) {
      logger.error("Failed to process EfiBank webhook", { error, payload });
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }),

  handleGenericPaymentWebhook: asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["x-webhook-signature"] as string;
    const payload = req.body;

    logger.info("Generic payment webhook received", { 
      signature: signature?.substring(0, 10) + "...",
      payload: typeof payload === "string" ? payload.substring(0, 100) + "..." : payload
    });

    // Verify webhook signature if secret is provided
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      if (!CryptoUtils.verifyWebhookSignature(payload.toString(), signature, webhookSecret)) {
        logger.warn("Invalid generic webhook signature", { signature });
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    try {
      const webhookData = JSON.parse(payload.toString());
      
      logger.info("Processing generic payment webhook", { webhookData });

      // Expected format: { transactionId, status, paymentId?, amount?, metadata? }
      const { transactionId, status, paymentId, amount, metadata } = webhookData;

      if (!transactionId || !status) {
        return res.status(400).json({ error: "Missing required webhook data" });
      }

      // Find transaction
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        logger.warn("Transaction not found for generic webhook", { transactionId });
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Update transaction
      const updateData: any = {
        status: status as any,
        updatedAt: new Date()
      };

      if (paymentId) {
        updateData.paymentId = paymentId;
      }

      await storage.updateTransaction(transactionId, updateData);

      // Log webhook activity
      await storage.logActivity({
        userId: transaction.userId,
        action: "webhook_received",
        details: {
          type: "generic",
          transactionId,
          oldStatus: transaction.status,
          newStatus: status,
          paymentId,
          metadata
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });

      // Process based on status
      if (status === "approved" && transaction.status !== "approved") {
        await processApprovedPayment(transactionId, transaction.userId);
      } else if (status === "cancelled" || status === "failed") {
        await processFailedPayment(transactionId, transaction.userId, status);
      }

      res.json({ 
        success: true,
        message: "Webhook processed successfully",
        transactionId
      });

    } catch (error) {
      logger.error("Failed to process generic payment webhook", { error, payload });
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }),

  // Webhook for FiveM server delivery confirmations
  handleDeliveryConfirmation: asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["x-fivem-signature"] as string;
    const payload = req.body;

    logger.info("FiveM delivery webhook received", { payload });

    // Verify webhook signature
    const fivemSecret = process.env.FIVEM_WEBHOOK_SECRET;
    if (fivemSecret && signature) {
      if (!CryptoUtils.verifyWebhookSignature(payload.toString(), signature, fivemSecret)) {
        logger.warn("Invalid FiveM webhook signature", { signature });
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    try {
      const deliveryData = JSON.parse(payload.toString());
      
      // Expected format: { grantId, status, identifier, message?, metadata? }
      const { grantId, status, identifier, message, metadata } = deliveryData;

      if (!grantId || !status || !identifier) {
        return res.status(400).json({ error: "Missing required delivery data" });
      }

      // Update grant status
      const grant = await storage.getGrant(grantId);
      if (!grant) {
        logger.warn("Grant not found for delivery webhook", { grantId });
        return res.status(404).json({ error: "Grant not found" });
      }

      await storage.updateGrant(grantId, {
        status: status as any
      });

      // Log delivery activity
      await storage.logActivity({
        userId: grant.userId,
        action: "item_delivered",
        details: {
          grantId,
          status,
          identifier,
          message,
          metadata
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });

      // If delivery was successful, send notification email
      if (status === "delivered") {
        const user = await storage.getUser(grant.userId);
        if (user && grant.grantData) {
          const grantData = typeof grant.grantData === "string" ? 
            JSON.parse(grant.grantData) : grant.grantData;
          
          emailService.sendDeliveryNotification(
            { username: user.username, email: user.email },
            [{
              name: grantData.productName || "Unknown Item",
              quantity: grantData.quantity || 1
            }]
          );
        }
      }

      res.json({ 
        success: true,
        message: "Delivery webhook processed successfully",
        grantId
      });

    } catch (error) {
      logger.error("Failed to process FiveM delivery webhook", { error, payload });
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  })
};

// Helper function to process approved payments
async function processApprovedPayment(transactionId: string, userId: number) {
  try {
    logger.info("Processing approved payment", { transactionId, userId });

    const transaction = await storage.getTransaction(transactionId);
    const user = await storage.getUser(userId);

    if (!transaction || !user) {
      logger.error("Transaction or user not found", { transactionId, userId });
      return;
    }

    // Parse products
    let products = [];
    try {
      products = JSON.parse(transaction.products || "[]");
    } catch (error) {
      logger.error("Failed to parse transaction products", { transactionId, error });
      return;
    }

    // Create grants for each product
    const grants = [];
    for (const product of products) {
      const grantId = CryptoUtils.generateUUID();
      
      const grant = await storage.createGrant({
        id: grantId,
        transactionId,
        userId,
        grantType: product.type,
        grantData: {
          productId: product.productId,
          productName: product.name,
          quantity: product.quantity,
          price: product.price,
          data: product.data
        },
        status: "pending"
      });

      grants.push(grant);

      // Try to deliver items immediately if user is online
      if (user.fivemIdentifier) {
        try {
          const deliveryResult = await fivemService.deliverItems({
            userIdentifier: user.fivemIdentifier,
            grantType: product.type,
            grantData: {
              productId: product.productId,
              productName: product.name,
              quantity: product.quantity,
              data: product.data
            },
            transactionId
          });

          if (deliveryResult.delivered) {
            await storage.updateGrant(grantId, {
              status: "delivered"
            });
          }

        } catch (error) {
          logger.error("Failed to deliver items immediately", { error, grantId });
        }
      }
    }

    // Handle special product types
    for (const product of products) {
      if (product.type === "coins") {
        // Add coins to user account
        const coinAmount = product.data?.amount || product.quantity * 100; // Default 100 coins per quantity
        await storage.updateUser(userId, {
          coins: user.coins + coinAmount
        });

        logger.info("Coins added to user account", { userId, amount: coinAmount });
      }

      if (product.type === "vip") {
        // Update VIP status
        const vipLevel = product.data?.level || "bronze";
        const vipDuration = product.data?.duration || 30; // 30 days default
        const vipExpires = new Date(Date.now() + vipDuration * 24 * 60 * 60 * 1000);

        await storage.updateUser(userId, {
          vipLevel,
          vipExpires
        });

        // Send VIP activation email
        emailService.sendVipActivation(
          { username: user.username, email: user.email },
          vipLevel,
          vipExpires
        );

        logger.info("VIP status updated", { userId, vipLevel, vipExpires });
      }

      // Update product stock if not unlimited
      if (product.stock !== -1) {
        const currentProduct = await storage.getProduct(product.productId);
        if (currentProduct && currentProduct.stock > 0) {
          await storage.updateProduct(product.productId, {
            stock: Math.max(0, currentProduct.stock - product.quantity)
          });
        }
      }
    }

    // Send confirmation email
    emailService.sendPurchaseConfirmation(
      { username: user.username, email: user.email },
      { 
        id: transactionId, 
        amount: transaction.amount, 
        paymentMethod: transaction.paymentMethod 
      },
      products.map(p => ({ name: p.name, quantity: p.quantity }))
    );

    // Log successful payment processing
    await storage.logActivity({
      userId,
      action: "payment_processed",
      details: {
        transactionId,
        amount: transaction.amount,
        itemCount: products.length,
        grantsCreated: grants.length
      },
      ipAddress: null,
      userAgent: "webhook"
    });

    logger.info("Payment processed successfully", { transactionId, userId, grantsCount: grants.length });

  } catch (error) {
    logger.error("Failed to process approved payment", { error, transactionId, userId });
    
    // Update transaction status to indicate processing error
    await storage.updateTransaction(transactionId, {
      status: "failed"
    });
  }
}

// Helper function to process failed/cancelled payments
async function processFailedPayment(transactionId: string, userId: number, status: string) {
  try {
    logger.info("Processing failed/cancelled payment", { transactionId, userId, status });

    // Log the failure
    await storage.logActivity({
      userId,
      action: "payment_failed",
      details: {
        transactionId,
        status,
        reason: status === "cancelled" ? "Payment cancelled by user" : "Payment failed"
      },
      ipAddress: null,
      userAgent: "webhook"
    });

    // Additional cleanup if needed (restore cart, etc.)
    // This could be implemented based on business requirements

  } catch (error) {
    logger.error("Failed to process failed payment", { error, transactionId, userId });
  }
}
