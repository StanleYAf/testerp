import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username", { length: 50 }).notNull().unique(),
  email: text("email", { length: 100 }).notNull().unique(),
  passwordHash: text("password_hash", { length: 255 }).notNull(),
  role: text("role", { enum: ["user", "admin", "super_admin"] }).default("user"),
  fivemIdentifier: text("fivem_identifier", { length: 100 }),
  discordId: text("discord_id", { length: 50 }),
  coins: integer("coins").default(0),
  vipLevel: text("vip_level", { length: 20 }).default("none"),
  vipExpires: integer("vip_expires", { mode: "timestamp" }),
  banned: integer("banned", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`)
});

// Products table
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code", { length: 50 }).notNull().unique(),
  name: text("name", { length: 100 }).notNull(),
  description: text("description"),
  price: real("price").notNull(),
  type: text("type", { enum: ["coins", "vip", "vehicle", "weapon", "item"] }).notNull(),
  data: text("data", { mode: "json" }), // JSON data for product specifics
  active: integer("active", { mode: "boolean" }).default(true),
  stock: integer("stock").default(-1), // -1 = unlimited
  category: text("category", { length: 50 }),
  imageUrl: text("image_url", { length: 255 }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`)
});

// Cart items table
export const cartItems = sqliteTable("cart_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`)
});

// Transactions table
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  paymentId: text("payment_id", { length: 100 }),
  amount: real("amount").notNull(),
  currency: text("currency", { length: 3 }).default("BRL"),
  status: text("status", { enum: ["pending", "approved", "cancelled", "failed"] }).default("pending"),
  paymentMethod: text("payment_method", { length: 20 }).default("pix"),
  qrCode: text("qr_code"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  products: text("products", { mode: "json" }), // JSON array of purchased products
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`)
});

// Grants table
export const grants = sqliteTable("grants", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").references(() => transactions.id),
  userId: integer("user_id").notNull().references(() => users.id),
  grantType: text("grant_type", { length: 20 }).notNull(),
  grantData: text("grant_data", { mode: "json" }),
  status: text("status", { enum: ["pending", "delivered", "failed"] }).default("pending"),
  grantedBy: integer("granted_by").references(() => users.id),
  grantedAt: integer("granted_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`)
});

// Activity logs table
export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  action: text("action", { length: 50 }).notNull(),
  details: text("details", { mode: "json" }),
  ipAddress: text("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`)
});

// Create schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const selectUserSchema = createSelectSchema(users);

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true
});

export const selectProductSchema = createSelectSchema(products);

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true
});

export const selectCartItemSchema = createSelectSchema(cartItems);

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  createdAt: true,
  updatedAt: true
});

export const selectTransactionSchema = createSelectSchema(transactions);

export const insertGrantSchema = createInsertSchema(grants).omit({
  grantedAt: true
});

export const selectGrantSchema = createSelectSchema(grants);

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true
});

export const selectActivityLogSchema = createSelectSchema(activityLogs);

// Additional validation schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const registerSchema = insertUserSchema.extend({
  password: z.string().min(6),
  confirmPassword: z.string().min(6)
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const addToCartSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().default(1)
});

export const createPaymentSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive()
  })),
  paymentMethod: z.string().default("pix")
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Grant = typeof grants.$inferSelect;
export type InsertGrant = z.infer<typeof insertGrantSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
