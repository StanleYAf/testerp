import path from "path";

export const databaseConfig = {
  // SQLite database path
  path: process.env.DATABASE_URL || path.join(process.cwd(), "database.sqlite"),
  
  // Connection options
  options: {
    verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
    fileMustExist: false,
    timeout: 30000,
    readonly: false
  },

  // Backup settings
  backup: {
    enabled: process.env.DB_BACKUP_ENABLED === "true",
    interval: parseInt(process.env.DB_BACKUP_INTERVAL || "3600000"), // 1 hour
    path: process.env.DB_BACKUP_PATH || path.join(process.cwd(), "backups"),
    maxBackups: parseInt(process.env.DB_BACKUP_MAX || "10")
  },

  // Performance settings
  performance: {
    // WAL mode for better concurrent access
    walMode: process.env.DB_WAL_MODE !== "false",
    
    // Pragma settings for SQLite optimization
    pragmas: {
      journal_mode: "WAL",
      synchronous: "NORMAL",
      cache_size: 10000,
      temp_store: "MEMORY",
      mmap_size: 268435456, // 256MB
      optimize: true
    }
  },

  // Migration settings
  migrations: {
    directory: path.join(process.cwd(), "migrations"),
    autoRun: process.env.DB_AUTO_MIGRATE === "true"
  }
};

export default databaseConfig;
