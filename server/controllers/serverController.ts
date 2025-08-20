import { Request, Response } from "express";
import { storage } from "../storage";
import { fivemService } from "../services/fivemService";
import { logger } from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import { CryptoUtils } from "../utils/crypto";

export const serverController = {
  // Server status
  getServerStatus: asyncHandler(async (req: Request, res: Response) => {
    try {
      const serverInfo = await fivemService.getServerStatus();
      
      // Get pending grants count
      const pendingGrants = await storage.getPendingGrants();
      
      res.json({
        success: true,
        server: {
          online: serverInfo.online,
          players: {
            current: serverInfo.players,
            max: serverInfo.maxPlayers
          },
          version: serverInfo.version,
          resources: serverInfo.resources,
          integration: {
            configured: fivemService.isConfigured(),
            pendingDeliveries: pendingGrants.length
          }
        }
      });

    } catch (error) {
      logger.error("Failed to get server status", { error });
      res.json({
        success: true,
        server: {
          online: false,
          players: { current: 0, max: 0 },
          version: "unknown",
          resources: [],
          integration: {
            configured: fivemService.isConfigured(),
            pendingDeliveries: 0,
            error: "Failed to connect to FiveM server"
          }
        }
      });
    }
  }),

  // Player management
  checkPlayerOnline: asyncHandler(async (req: Request, res: Response) => {
    const { identifier } = req.params;

    if (!fivemService.validateIdentifier(identifier)) {
      return res.status(400).json({ error: "Invalid FiveM identifier format" });
    }

    try {
      const playerInfo = await fivemService.isPlayerOnline(identifier);
      
      res.json({
        success: true,
        player: {
          identifier,
          online: !!playerInfo,
          info: playerInfo
        }
      });

    } catch (error) {
      logger.error("Failed to check player online status", { error, identifier });
      return res.status(500).json({
        error: "Failed to check player status",
        message: "FiveM server communication error"
      });
    }
  }),

  kickPlayer: asyncHandler(async (req: Request, res: Response) => {
    const { identifier } = req.params;
    const { reason = "Kicked by admin" } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!fivemService.validateIdentifier(identifier)) {
      return res.status(400).json({ error: "Invalid FiveM identifier format" });
    }

    try {
      const success = await fivemService.kickPlayer(identifier, reason);
      
      if (success) {
        // Log activity
        await storage.logActivity({
          userId: req.user.id,
          action: "player_kicked",
          details: {
            identifier,
            reason,
            adminUsername: req.user.username
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent")
        });

        res.json({
          success: true,
          message: "Player kicked successfully",
          identifier,
          reason
        });
      } else {
        res.status(400).json({
          error: "Failed to kick player",
          message: "Player may not be online or FiveM server error"
        });
      }

    } catch (error) {
      logger.error("Failed to kick player", { error, identifier });
      return res.status(500).json({
        error: "Failed to kick player",
        message: "FiveM server communication error"
      });
    }
  }),

  // Item delivery
  deliverItems: asyncHandler(async (req: Request, res: Response) => {
    const { userIdentifier, grantType, grantData, transactionId } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!fivemService.validateIdentifier(userIdentifier)) {
      return res.status(400).json({ error: "Invalid FiveM identifier format" });
    }

    try {
      // Create grant record
      const grantId = CryptoUtils.generateUUID();
      
      // Find user by FiveM identifier
      const users = await storage.getAllUsers(1000, 0);
      const user = users.find(u => u.fivemIdentifier === userIdentifier);

      if (!user) {
        return res.status(404).json({ 
          error: "User not found",
          message: "No user found with the specified FiveM identifier"
        });
      }

      const grant = await storage.createGrant({
        id: grantId,
        transactionId: transactionId || undefined,
        userId: user.id,
        grantType,
        grantData,
        status: "pending",
        grantedBy: req.user.id
      });

      // Attempt delivery
      const deliveryResult = await fivemService.deliverItemsWithRetry({
        userIdentifier,
        grantType,
        grantData,
        transactionId
      });

      // Update grant status based on delivery result
      await storage.updateGrant(grantId, {
        status: deliveryResult.delivered ? "delivered" : "failed"
      });

      // Log activity
      await storage.logActivity({
        userId: req.user.id,
        action: "manual_delivery",
        details: {
          grantId,
          targetIdentifier: userIdentifier,
          targetUserId: user.id,
          grantType,
          grantData,
          delivered: deliveryResult.delivered,
          adminUsername: req.user.username
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });

      res.json({
        success: true,
        message: deliveryResult.message,
        delivery: {
          grantId,
          delivered: deliveryResult.delivered,
          userIdentifier,
          grantType,
          retryAfter: deliveryResult.retryAfter
        }
      });

    } catch (error) {
      logger.error("Failed to deliver items", { error, userIdentifier, grantType });
      return res.status(500).json({
        error: "Failed to deliver items",
        message: "Server communication error or user not found"
      });
    }
  }),

  // Bulk delivery processing
  processPendingDeliveries: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const pendingGrants = await storage.getPendingGrants();
      const results = {
        processed: 0,
        delivered: 0,
        failed: 0,
        skipped: 0
      };

      logger.info(`Processing ${pendingGrants.length} pending deliveries`);

      for (const grant of pendingGrants) {
        try {
          results.processed++;

          // Get user info
          const user = await storage.getUser(grant.userId);
          if (!user || !user.fivemIdentifier) {
            results.skipped++;
            logger.warn("Skipping grant - user has no FiveM identifier", { grantId: grant.id });
            continue;
          }

          // Attempt delivery
          const deliveryResult = await fivemService.deliverItems({
            userIdentifier: user.fivemIdentifier,
            grantType: grant.grantType,
            grantData: grant.grantData,
            transactionId: grant.transactionId || undefined
          });

          if (deliveryResult.delivered) {
            await storage.updateGrant(grant.id, { status: "delivered" });
            results.delivered++;
          } else {
            results.failed++;
          }

        } catch (error) {
          logger.error("Failed to process grant delivery", { error, grantId: grant.id });
          results.failed++;
        }
      }

      // Log bulk delivery activity
      await storage.logActivity({
        userId: req.user.id,
        action: "bulk_delivery_processed",
        details: {
          totalPending: pendingGrants.length,
          results,
          adminUsername: req.user.username
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });

      res.json({
        success: true,
        message: "Bulk delivery processing completed",
        results
      });

    } catch (error) {
      logger.error("Failed to process pending deliveries", { error });
      return res.status(500).json({
        error: "Failed to process pending deliveries",
        message: "Internal server error"
      });
    }
  }),

  // Server commands
  executeServerCommand: asyncHandler(async (req: Request, res: Response) => {
    const { command } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Only super admins can execute server commands
    if (req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access required" });
    }

    if (!command || typeof command !== "string") {
      return res.status(400).json({ error: "Valid command is required" });
    }

    // Blacklist dangerous commands
    const dangerousCommands = ["stop", "quit", "restart", "shutdown", "rm", "del", "kill"];
    const commandLower = command.toLowerCase();
    
    if (dangerousCommands.some(dangerous => commandLower.includes(dangerous))) {
      return res.status(403).json({ 
        error: "Command not allowed",
        message: "Dangerous commands are restricted"
      });
    }

    try {
      const result = await fivemService.executeCommand(command);

      // Log command execution
      await storage.logActivity({
        userId: req.user.id,
        action: "server_command_executed",
        details: {
          command,
          result,
          adminUsername: req.user.username
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });

      res.json({
        success: true,
        message: "Command executed successfully",
        command,
        result
      });

    } catch (error) {
      logger.error("Failed to execute server command", { error, command });
      return res.status(500).json({
        error: "Failed to execute command",
        message: "FiveM server communication error"
      });
    }
  }),

  // Get delivery queue status
  getDeliveryQueue: asyncHandler(async (req: Request, res: Response) => {
    try {
      const pendingGrants = await storage.getPendingGrants();
      
      // Get user info for each grant
      const queueWithUserInfo = await Promise.all(
        pendingGrants.map(async (grant) => {
          const user = await storage.getUser(grant.userId);
          
          return {
            id: grant.id,
            grantType: grant.grantType,
            grantData: grant.grantData,
            grantedAt: grant.grantedAt,
            transactionId: grant.transactionId,
            user: user ? {
              id: user.id,
              username: user.username,
              fivemIdentifier: user.fivemIdentifier
            } : null
          };
        })
      );

      // Group by grant type
      const byType = queueWithUserInfo.reduce((acc: Record<string, number>, grant) => {
        acc[grant.grantType] = (acc[grant.grantType] || 0) + 1;
        return acc;
      }, {});

      res.json({
        success: true,
        queue: {
          total: pendingGrants.length,
          byType,
          items: queueWithUserInfo.slice(0, 50), // Limit to 50 items for performance
          hasMore: queueWithUserInfo.length > 50
        }
      });

    } catch (error) {
      logger.error("Failed to get delivery queue", { error });
      return res.status(500).json({
        error: "Failed to get delivery queue",
        message: "Internal server error"
      });
    }
  }),

  // Send message to player
  sendPlayerMessage: asyncHandler(async (req: Request, res: Response) => {
    const { identifier } = req.params;
    const { message } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!fivemService.validateIdentifier(identifier)) {
      return res.status(400).json({ error: "Invalid FiveM identifier format" });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      const success = await fivemService.sendMessage(identifier, message);
      
      if (success) {
        // Log activity
        await storage.logActivity({
          userId: req.user.id,
          action: "player_message_sent",
          details: {
            identifier,
            message: message.substring(0, 100), // Limit logged message length
            adminUsername: req.user.username
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent")
        });

        res.json({
          success: true,
          message: "Message sent successfully",
          identifier
        });
      } else {
        res.status(400).json({
          error: "Failed to send message",
          message: "Player may not be online or FiveM server error"
        });
      }

    } catch (error) {
      logger.error("Failed to send player message", { error, identifier });
      return res.status(500).json({
        error: "Failed to send message",
        message: "FiveM server communication error"
      });
    }
  })
};
