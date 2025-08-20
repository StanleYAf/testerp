import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type {
  User, InsertUser, Product, InsertProduct, CartItem, InsertCartItem,
  Transaction, InsertTransaction, Grant, InsertGrant, ActivityLog, InsertActivityLog
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  getAllUsers(limit?: number, offset?: number): Promise<User[]>;
  
  // Product methods
  getProduct(id: number): Promise<Product | undefined>;
  getProductByCode(code: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, updates: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
  getAllProducts(filters?: { category?: string; type?: string; active?: boolean }): Promise<Product[]>;
  getProductCategories(): Promise<string[]>;
  
  // Cart methods
  getCartItems(userId: number): Promise<CartItem[]>;
  addToCart(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: number, quantity: number): Promise<CartItem | undefined>;
  removeFromCart(id: number): Promise<boolean>;
  clearCart(userId: number): Promise<boolean>;
  
  // Transaction methods
  getTransaction(id: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined>;
  getUserTransactions(userId: number): Promise<Transaction[]>;
  getAllTransactions(limit?: number, offset?: number): Promise<Transaction[]>;
  
  // Grant methods
  getGrant(id: string): Promise<Grant | undefined>;
  createGrant(grant: InsertGrant): Promise<Grant>;
  updateGrant(id: string, updates: Partial<Grant>): Promise<Grant | undefined>;
  getUserGrants(userId: number): Promise<Grant[]>;
  getPendingGrants(): Promise<Grant[]>;
  
  // Activity log methods
  logActivity(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(userId?: number, limit?: number): Promise<ActivityLog[]>;
  
  // Analytics methods
  getUserCount(): Promise<number>;
  getProductCount(): Promise<number>;
  getTransactionStats(): Promise<{ total: number; revenue: number; pending: number }>;
}

export class SqliteStorage implements IStorage {
  private db: Database.Database;
  private drizzle: ReturnType<typeof drizzle>;

  constructor(dbPath: string = "./database.sqlite") {
    this.db = new Database(dbPath);
    this.drizzle = drizzle(this.db, { schema });
    this.init();
  }

  private init() {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        fivem_identifier TEXT,
        discord_id TEXT,
        coins INTEGER DEFAULT 0,
        vip_level TEXT DEFAULT 'none',
        vip_expires INTEGER,
        banned INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        updated_at INTEGER DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        type TEXT NOT NULL,
        data TEXT,
        active INTEGER DEFAULT 1,
        stock INTEGER DEFAULT -1,
        category TEXT,
        image_url TEXT,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        payment_id TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'BRL',
        status TEXT DEFAULT 'pending',
        payment_method TEXT DEFAULT 'pix',
        qr_code TEXT,
        expires_at INTEGER,
        products TEXT,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        updated_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS grants (
        id TEXT PRIMARY KEY,
        transaction_id TEXT,
        user_id INTEGER NOT NULL,
        grant_type TEXT NOT NULL,
        grant_data TEXT,
        status TEXT DEFAULT 'pending',
        granted_by INTEGER,
        granted_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (granted_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.drizzle.select().from(schema.users).where(eq(schema.users.id, id)).get();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.drizzle.select().from(schema.users).where(eq(schema.users.email, email)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.drizzle.select().from(schema.users).where(eq(schema.users.username, username)).get();
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = this.drizzle.insert(schema.users).values(user).returning().all();
    return newUser;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = this.drizzle.update(schema.users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning()
      .all();
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = this.drizzle.delete(schema.users).where(eq(schema.users.id, id)).run();
    return result.changes > 0;
  }

  async getAllUsers(limit = 100, offset = 0): Promise<User[]> {
    return this.drizzle.select().from(schema.users).limit(limit).offset(offset).all();
  }

  // Product methods
  async getProduct(id: number): Promise<Product | undefined> {
    return this.drizzle.select().from(schema.products).where(eq(schema.products.id, id)).get();
  }

  async getProductByCode(code: string): Promise<Product | undefined> {
    return this.drizzle.select().from(schema.products).where(eq(schema.products.code, code)).get();
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = this.drizzle.insert(schema.products).values(product).returning().all();
    return newProduct;
  }

  async updateProduct(id: number, updates: Partial<Product>): Promise<Product | undefined> {
    const [updatedProduct] = this.drizzle.update(schema.products)
      .set(updates)
      .where(eq(schema.products.id, id))
      .returning()
      .all();
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = this.drizzle.delete(schema.products).where(eq(schema.products.id, id)).run();
    return result.changes > 0;
  }

  async getAllProducts(filters?: { category?: string; type?: string; active?: boolean }): Promise<Product[]> {
    let query = this.drizzle.select().from(schema.products);
    
    if (filters?.category) {
      query = query.where(eq(schema.products.category, filters.category));
    }
    if (filters?.type) {
      query = query.where(eq(schema.products.type, filters.type));
    }
    if (filters?.active !== undefined) {
      query = query.where(eq(schema.products.active, filters.active));
    }
    
    return query.all();
  }

  async getProductCategories(): Promise<string[]> {
    const result = this.drizzle.selectDistinct({ category: schema.products.category })
      .from(schema.products)
      .where(eq(schema.products.active, true))
      .all();
    return result.map(r => r.category).filter(Boolean);
  }

  // Cart methods
  async getCartItems(userId: number): Promise<CartItem[]> {
    return this.drizzle.select().from(schema.cartItems)
      .where(eq(schema.cartItems.userId, userId))
      .all();
  }

  async addToCart(cartItem: InsertCartItem): Promise<CartItem> {
    // Check if item already exists in cart
    const existing = this.drizzle.select().from(schema.cartItems)
      .where(and(
        eq(schema.cartItems.userId, cartItem.userId),
        eq(schema.cartItems.productId, cartItem.productId)
      ))
      .get();

    if (existing) {
      // Update quantity
      const [updated] = this.drizzle.update(schema.cartItems)
        .set({ quantity: existing.quantity + cartItem.quantity })
        .where(eq(schema.cartItems.id, existing.id))
        .returning()
        .all();
      return updated;
    } else {
      // Add new item
      const [newItem] = this.drizzle.insert(schema.cartItems).values(cartItem).returning().all();
      return newItem;
    }
  }

  async updateCartItem(id: number, quantity: number): Promise<CartItem | undefined> {
    const [updated] = this.drizzle.update(schema.cartItems)
      .set({ quantity })
      .where(eq(schema.cartItems.id, id))
      .returning()
      .all();
    return updated;
  }

  async removeFromCart(id: number): Promise<boolean> {
    const result = this.drizzle.delete(schema.cartItems).where(eq(schema.cartItems.id, id)).run();
    return result.changes > 0;
  }

  async clearCart(userId: number): Promise<boolean> {
    const result = this.drizzle.delete(schema.cartItems).where(eq(schema.cartItems.userId, userId)).run();
    return result.changes > 0;
  }

  // Transaction methods
  async getTransaction(id: string): Promise<Transaction | undefined> {
    return this.drizzle.select().from(schema.transactions).where(eq(schema.transactions.id, id)).get();
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = this.drizzle.insert(schema.transactions).values(transaction).returning().all();
    return newTransaction;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const [updated] = this.drizzle.update(schema.transactions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.transactions.id, id))
      .returning()
      .all();
    return updated;
  }

  async getUserTransactions(userId: number): Promise<Transaction[]> {
    return this.drizzle.select().from(schema.transactions)
      .where(eq(schema.transactions.userId, userId))
      .orderBy(desc(schema.transactions.createdAt))
      .all();
  }

  async getAllTransactions(limit = 100, offset = 0): Promise<Transaction[]> {
    return this.drizzle.select().from(schema.transactions)
      .orderBy(desc(schema.transactions.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
  }

  // Grant methods
  async getGrant(id: string): Promise<Grant | undefined> {
    return this.drizzle.select().from(schema.grants).where(eq(schema.grants.id, id)).get();
  }

  async createGrant(grant: InsertGrant): Promise<Grant> {
    const [newGrant] = this.drizzle.insert(schema.grants).values(grant).returning().all();
    return newGrant;
  }

  async updateGrant(id: string, updates: Partial<Grant>): Promise<Grant | undefined> {
    const [updated] = this.drizzle.update(schema.grants)
      .set(updates)
      .where(eq(schema.grants.id, id))
      .returning()
      .all();
    return updated;
  }

  async getUserGrants(userId: number): Promise<Grant[]> {
    return this.drizzle.select().from(schema.grants)
      .where(eq(schema.grants.userId, userId))
      .orderBy(desc(schema.grants.grantedAt))
      .all();
  }

  async getPendingGrants(): Promise<Grant[]> {
    return this.drizzle.select().from(schema.grants)
      .where(eq(schema.grants.status, "pending"))
      .orderBy(desc(schema.grants.grantedAt))
      .all();
  }

  // Activity log methods
  async logActivity(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = this.drizzle.insert(schema.activityLogs).values(log).returning().all();
    return newLog;
  }

  async getActivityLogs(userId?: number, limit = 100): Promise<ActivityLog[]> {
    let query = this.drizzle.select().from(schema.activityLogs);
    
    if (userId) {
      query = query.where(eq(schema.activityLogs.userId, userId));
    }
    
    return query.orderBy(desc(schema.activityLogs.createdAt)).limit(limit).all();
  }

  // Analytics methods
  async getUserCount(): Promise<number> {
    const result = this.drizzle.select({ count: sql<number>`count(*)` }).from(schema.users).get();
    return result?.count || 0;
  }

  async getProductCount(): Promise<number> {
    const result = this.drizzle.select({ count: sql<number>`count(*)` })
      .from(schema.products)
      .where(eq(schema.products.active, true))
      .get();
    return result?.count || 0;
  }

  async getTransactionStats(): Promise<{ total: number; revenue: number; pending: number }> {
    const total = this.drizzle.select({ count: sql<number>`count(*)` }).from(schema.transactions).get();
    const revenue = this.drizzle.select({ sum: sql<number>`sum(amount)` })
      .from(schema.transactions)
      .where(eq(schema.transactions.status, "approved"))
      .get();
    const pending = this.drizzle.select({ count: sql<number>`count(*)` })
      .from(schema.transactions)
      .where(eq(schema.transactions.status, "pending"))
      .get();

    return {
      total: total?.count || 0,
      revenue: revenue?.sum || 0,
      pending: pending?.count || 0
    };
  }
}

export const storage = new SqliteStorage();
