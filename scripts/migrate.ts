import { storage } from "../server/storage";
import { logger } from "../server/utils/logger";

async function runMigrations() {
  try {
    logger.info("Starting database migrations...");

    // The SqliteStorage constructor already creates tables if they don't exist
    // This script can be extended to handle more complex migrations in the future
    
    // Test database connection
    const userCount = await storage.getUserCount();
    logger.info(`Database connected successfully. User count: ${userCount}`);

    // Additional migration steps can be added here
    // Example:
    // await addNewColumnsIfNeeded();
    // await migrateDataFormat();
    // await createIndexes();

    logger.info("Database migrations completed successfully");
    process.exit(0);

  } catch (error) {
    logger.error("Database migration failed", { error });
    process.exit(1);
  }
}

async function addIndexesForPerformance() {
  try {
    // Add indexes for better query performance
    const db = (storage as any).db; // Access the underlying database connection
    
    if (db) {
      // User indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_fivem_identifier ON users(fivem_identifier);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned);`);
      
      // Product indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);`);
      
      // Transaction indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(payment_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);`);
      
      // Cart indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);`);
      
      // Grant indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_grants_user_id ON grants(user_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_grants_status ON grants(status);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_grants_transaction_id ON grants(transaction_id);`);
      
      // Activity log indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);`);
      
      logger.info("Database indexes created successfully");
    }
  } catch (error) {
    logger.error("Failed to create database indexes", { error });
  }
}

async function optimizeDatabase() {
  try {
    const db = (storage as any).db;
    
    if (db) {
      // Set SQLite performance pragmas
      db.exec(`PRAGMA journal_mode = WAL;`);
      db.exec(`PRAGMA synchronous = NORMAL;`);
      db.exec(`PRAGMA cache_size = 10000;`);
      db.exec(`PRAGMA temp_store = MEMORY;`);
      db.exec(`PRAGMA mmap_size = 268435456;`); // 256MB
      
      // Analyze database for query optimization
      db.exec(`ANALYZE;`);
      
      logger.info("Database optimization completed");
    }
  } catch (error) {
    logger.error("Failed to optimize database", { error });
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations().then(async () => {
    await addIndexesForPerformance();
    await optimizeDatabase();
  });
}

export { runMigrations, addIndexesForPerformance, optimizeDatabase };
