import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import helmet from "helmet";
import cors from "cors";

// Middleware imports
import { generalRateLimit, authRateLimit, paymentRateLimit, adminRateLimit, webhookRateLimit } from "./middleware/rateLimiter";
import { authenticateToken, requireRole, optionalAuth } from "./middleware/auth";
import { validateBody, validateParams, validateQuery, paginationSchema, idParamSchema, stringIdParamSchema } from "./middleware/validation";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// Controllers
import { authController } from "./controllers/authController";
import { userController } from "./controllers/userController";
import { productController } from "./controllers/productController";
import { cartController } from "./controllers/cartController";
import { paymentController } from "./controllers/paymentController";
import { webhookController } from "./controllers/webhookController";
import { adminController } from "./controllers/adminController";
import { serverController } from "./controllers/serverController";

// Validation schemas
import {
  registerValidation,
  loginValidation,
  createProductValidation,
  updateUserValidation,
  createPaymentValidation,
  validators
} from "./utils/validators";
import { addToCartSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true
  }));

  // Rate limiting
  app.use("/api", generalRateLimit);

  // Health check endpoint (no rate limiting)
  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "2.0.0",
      environment: process.env.NODE_ENV || "development"
    });
  });

  // API version info
  app.get("/api/version", (req, res) => {
    res.json({
      success: true,
      version: "2.0.0",
      api: "FiveM Store API",
      description: "Complete REST API for FiveM game store with PIX payments"
    });
  });

  // API endpoints list
  app.get("/api/endpoints", (req, res) => {
    res.json({
      success: true,
      endpoints: {
        auth: [
          "POST /api/auth/register",
          "POST /api/auth/login",
          "GET /api/auth/me",
          "PUT /api/auth/me",
          "POST /api/auth/change-password",
          "POST /api/auth/logout",
          "POST /api/auth/refresh"
        ],
        users: [
          "GET /api/users/:id",
          "GET /api/users/search",
          "GET /api/users/stats",
          "GET /api/users/transactions",
          "GET /api/users/grants",
          "PUT /api/users/coins",
          "GET /api/users/activity"
        ],
        products: [
          "GET /api/products",
          "GET /api/products/:id",
          "GET /api/products/code/:code",
          "GET /api/products/categories",
          "GET /api/products/featured",
          "GET /api/products/types",
          "GET /api/products/stats",
          "GET /api/products/:id/stock",
          "GET /api/products/search"
        ],
        cart: [
          "GET /api/cart",
          "POST /api/cart/add",
          "PUT /api/cart/item/:id",
          "DELETE /api/cart/item/:id",
          "DELETE /api/cart/clear",
          "GET /api/cart/stats",
          "GET /api/cart/validate"
        ],
        payments: [
          "POST /api/payments/create",
          "GET /api/payments/:id",
          "GET /api/payments/:id/status",
          "POST /api/payments/:id/cancel"
        ],
        webhooks: [
          "POST /api/webhooks/efibank",
          "POST /api/webhooks/payment"
        ],
        admin: [
          "GET /api/admin/users",
          "PUT /api/admin/users/:id/ban",
          "PUT /api/admin/users/:id/unban",
          "POST /api/admin/users/:id/grant",
          "POST /api/admin/products",
          "PUT /api/admin/products/:id",
          "DELETE /api/admin/products/:id",
          "GET /api/admin/transactions",
          "GET /api/admin/grants",
          "POST /api/admin/grant",
          "GET /api/admin/analytics",
          "GET /api/admin/logs"
        ],
        server: [
          "POST /api/server/deliver",
          "GET /api/server/user/:identifier/online",
          "POST /api/server/user/:identifier/kick",
          "GET /api/server/status"
        ]
      }
    });
  });

  // Authentication routes
  app.post("/api/auth/register", authRateLimit, validateBody(registerValidation), authController.register);
  app.post("/api/auth/login", authRateLimit, validateBody(loginValidation), authController.login);
  app.get("/api/auth/me", authenticateToken, authController.me);
  app.put("/api/auth/me", authenticateToken, validateBody(updateUserValidation), authController.updateProfile);
  app.post("/api/auth/change-password", authenticateToken, validateBody(z.object({
    currentPassword: z.string().min(1),
    newPassword: validators.password
  })), authController.changePassword);
  app.post("/api/auth/logout", optionalAuth, authController.logout);
  app.post("/api/auth/refresh", authenticateToken, authController.refreshToken);

  // User routes
  app.get("/api/users/:id", validateParams(idParamSchema), userController.getUser);
  app.get("/api/users/search", validateQuery(z.object({
    q: validators.searchQuery,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })), userController.searchUsers);
  app.get("/api/users/stats", authenticateToken, userController.getUserStats);
  app.get("/api/users/transactions", authenticateToken, userController.getUserTransactions);
  app.get("/api/users/grants", authenticateToken, userController.getUserGrants);
  app.put("/api/users/coins", authenticateToken, validateBody(z.object({
    amount: validators.positiveInt,
    operation: z.enum(["add", "subtract"]).default("add")
  })), userController.updateCoins);
  app.get("/api/users/activity", authenticateToken, validateQuery(z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })), userController.getUserActivity);

  // Product routes
  app.get("/api/products", validateQuery(z.object({
    category: z.string().optional(),
    type: validators.productType.optional(),
    active: z.enum(["true", "false", "all"]).default("true"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional()
  })), productController.getAllProducts);
  app.get("/api/products/:id", validateParams(idParamSchema), productController.getProduct);
  app.get("/api/products/code/:code", validateParams(z.object({
    code: validators.productCode
  })), productController.getProductByCode);
  app.get("/api/products/categories", productController.getCategories);
  app.get("/api/products/featured", validateQuery(z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10)
  })), productController.getFeaturedProducts);
  app.get("/api/products/types", productController.getProductTypes);
  app.get("/api/products/stats", productController.getProductStats);
  app.get("/api/products/:id/stock", validateParams(idParamSchema), validateQuery(z.object({
    quantity: z.coerce.number().int().min(1).default(1)
  })), productController.checkStock);
  app.get("/api/products/search", validateQuery(z.object({
    q: validators.searchQuery,
    limit: z.coerce.number().int().min(1).max(50).default(20)
  })), productController.searchProducts);

  // Cart routes (require authentication)
  app.get("/api/cart", authenticateToken, cartController.getCart);
  app.post("/api/cart/add", authenticateToken, validateBody(addToCartSchema), cartController.addToCart);
  app.put("/api/cart/item/:id", authenticateToken, validateParams(idParamSchema), validateBody(z.object({
    quantity: validators.quantity
  })), cartController.updateCartItem);
  app.delete("/api/cart/item/:id", authenticateToken, validateParams(idParamSchema), cartController.removeFromCart);
  app.delete("/api/cart/clear", authenticateToken, cartController.clearCart);
  app.get("/api/cart/stats", authenticateToken, cartController.getCartStats);
  app.get("/api/cart/validate", authenticateToken, cartController.validateCart);

  // Payment routes
  app.post("/api/payments/create", paymentRateLimit, authenticateToken, validateBody(createPaymentValidation), paymentController.createPayment);
  app.get("/api/payments/:id", authenticateToken, validateParams(stringIdParamSchema), paymentController.getPayment);
  app.get("/api/payments/:id/status", authenticateToken, validateParams(stringIdParamSchema), paymentController.getPaymentStatus);
  app.post("/api/payments/:id/cancel", authenticateToken, validateParams(stringIdParamSchema), paymentController.cancelPayment);

  // Webhook routes (no authentication, verified by signature)
  app.post("/api/webhooks/efibank", webhookRateLimit, express.raw({ type: "application/json" }), webhookController.handleEfiBankWebhook);
  app.post("/api/webhooks/payment", webhookRateLimit, express.raw({ type: "application/json" }), webhookController.handleGenericPaymentWebhook);

  // Admin routes (require admin role)
  app.get("/api/admin/users", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateQuery(paginationSchema), adminController.getUsers);
  app.put("/api/admin/users/:id/ban", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateParams(idParamSchema), validateBody(z.object({
    reason: z.string().min(1).max(500)
  })), adminController.banUser);
  app.put("/api/admin/users/:id/unban", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateParams(idParamSchema), adminController.unbanUser);
  app.post("/api/admin/users/:id/grant", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateParams(idParamSchema), validateBody(z.object({
    grantType: z.string().min(1),
    grantData: z.record(z.any()),
    reason: z.string().optional()
  })), adminController.grantItemsToUser);

  // Admin product management
  app.post("/api/admin/products", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateBody(createProductValidation), adminController.createProduct);
  app.put("/api/admin/products/:id", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateParams(idParamSchema), validateBody(createProductValidation.partial()), adminController.updateProduct);
  app.delete("/api/admin/products/:id", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateParams(idParamSchema), adminController.deleteProduct);

  // Admin data access
  app.get("/api/admin/transactions", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateQuery(paginationSchema.extend({
    status: validators.transactionStatus.optional(),
    userId: z.coerce.number().int().positive().optional()
  })), adminController.getTransactions);
  app.get("/api/admin/grants", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateQuery(paginationSchema.extend({
    status: validators.grantStatus.optional(),
    userId: z.coerce.number().int().positive().optional()
  })), adminController.getGrants);
  app.post("/api/admin/grant", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateBody(z.object({
    userId: z.number().int().positive(),
    grantType: z.string().min(1),
    grantData: z.record(z.any()),
    reason: z.string().min(1)
  })), adminController.manualGrant);

  // Admin analytics and logs
  app.get("/api/admin/analytics", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateQuery(z.object({
    period: z.enum(["day", "week", "month", "year"]).default("month"),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional()
  })), adminController.getAnalytics);
  app.get("/api/admin/logs", adminRateLimit, authenticateToken, requireRole(["admin", "super_admin"]), validateQuery(paginationSchema.extend({
    userId: z.coerce.number().int().positive().optional(),
    action: z.string().optional()
  })), adminController.getLogs);

  // FiveM server integration routes
  app.post("/api/server/deliver", authenticateToken, requireRole(["admin", "super_admin"]), validateBody(z.object({
    userIdentifier: validators.fivemIdentifier,
    grantType: z.string().min(1),
    grantData: z.record(z.any()),
    transactionId: validators.uuid.optional()
  })), serverController.deliverItems);
  app.get("/api/server/user/:identifier/online", authenticateToken, requireRole(["admin", "super_admin"]), validateParams(z.object({
    identifier: validators.fivemIdentifier
  })), serverController.checkPlayerOnline);
  app.post("/api/server/user/:identifier/kick", authenticateToken, requireRole(["admin", "super_admin"]), validateParams(z.object({
    identifier: validators.fivemIdentifier
  })), validateBody(z.object({
    reason: z.string().default("Kicked by admin")
  })), serverController.kickPlayer);
  app.get("/api/server/status", optionalAuth, serverController.getServerStatus);

  // Swagger/OpenAPI documentation endpoint
  app.get("/api/docs", (req, res) => {
    res.json({
      openapi: "3.0.0",
      info: {
        title: "FiveM Store API",
        version: "2.0.0",
        description: "Complete REST API for FiveM game store with PIX payments, user management, and server integration",
        contact: {
          name: "FiveM Store API Support",
          email: "support@fivemstore.com"
        }
      },
      servers: [
        {
          url: process.env.API_BASE_URL || "https://your-replit-app.replit.app/api",
          description: "Production server"
        },
        {
          url: "http://localhost:5000/api",
          description: "Development server"
        }
      ],
      paths: {
        "/health": {
          get: {
            summary: "Health check",
            description: "Returns API health status",
            responses: {
              200: {
                description: "API is healthy",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        success: { type: "boolean" },
                        status: { type: "string" },
                        timestamp: { type: "string" },
                        version: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        // Additional endpoint documentation would go here in a full implementation
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      }
    });
  });

  // Error handling middleware (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  const httpServer = createServer(app);

  return httpServer;
}
