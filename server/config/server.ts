export const serverConfig = {
  // Server basics
  port: parseInt(process.env.PORT || "8000"),
  host: process.env.HOST || "0.0.0.0",
  environment: process.env.NODE_ENV || "development",
  
  // CORS settings
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
  },
  
  // Security settings
  security: {
    // JWT settings
    jwt: {
      secret: process.env.JWT_SECRET || "your-super-secret-jwt-key-here",
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      issuer: process.env.JWT_ISSUER || "fivem-store-api",
      audience: process.env.JWT_AUDIENCE || "fivem-store-users"
    },
    
    // Rate limiting
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || "15") * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || "100"),
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    
    // Helmet configuration
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    }
  },
  
  // API settings
  api: {
    prefix: "/api",
    version: "2.0.0",
    
    // Request limits
    bodyLimit: process.env.API_BODY_LIMIT || "10mb",
    parameterLimit: parseInt(process.env.API_PARAMETER_LIMIT || "100"),
    
    // Timeout settings
    timeout: parseInt(process.env.API_TIMEOUT || "30000"), // 30 seconds
    
    // Pagination defaults
    pagination: {
      defaultLimit: parseInt(process.env.API_DEFAULT_LIMIT || "20"),
      maxLimit: parseInt(process.env.API_MAX_LIMIT || "100")
    }
  },
  
  // FiveM integration
  fivem: {
    serverUrl: process.env.FIVEM_SERVER_URL || "http://localhost:30120",
    serverToken: process.env.FIVEM_SERVER_TOKEN || "",
    
    // Connection settings
    timeout: parseInt(process.env.FIVEM_TIMEOUT || "10000"), // 10 seconds
    retryAttempts: parseInt(process.env.FIVEM_RETRY_ATTEMPTS || "3"),
    retryDelay: parseInt(process.env.FIVEM_RETRY_DELAY || "5000"), // 5 seconds
    
    // Delivery settings
    delivery: {
      maxRetries: parseInt(process.env.FIVEM_DELIVERY_RETRIES || "5"),
      retryInterval: parseInt(process.env.FIVEM_DELIVERY_INTERVAL || "300000"), // 5 minutes
      batchSize: parseInt(process.env.FIVEM_BATCH_SIZE || "10")
    }
  },
  
  // Email settings
  email: {
    enabled: process.env.EMAIL_ENABLED === "true",
    
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || ""
    },
    
    defaults: {
      from: process.env.EMAIL_FROM || "FiveM Store <noreply@fivemstore.com>",
      replyTo: process.env.EMAIL_REPLY_TO || ""
    },
    
    // Email template settings
    templates: {
      baseUrl: process.env.EMAIL_BASE_URL || "https://your-store.com"
    }
  },
  
  // Admin settings
  admin: {
    email: process.env.SUPER_ADMIN_EMAIL || "admin@sua-loja.com",
    password: process.env.SUPER_ADMIN_PASSWORD || "senha-admin-segura",
    
    // Auto-create super admin on startup
    autoCreate: process.env.ADMIN_AUTO_CREATE === "true",
    
    // Admin panel settings
    panel: {
      enabled: process.env.ADMIN_PANEL_ENABLED === "true",
      path: process.env.ADMIN_PANEL_PATH || "/admin"
    }
  },
  
  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || "info",
    
    // File logging
    file: {
      enabled: process.env.LOG_FILE_ENABLED !== "false",
      path: process.env.LOG_PATH || "./logs",
      maxSize: process.env.LOG_MAX_SIZE || "10m",
      maxFiles: parseInt(process.env.LOG_MAX_FILES || "5")
    },
    
    // Console logging
    console: {
      enabled: process.env.LOG_CONSOLE_ENABLED !== "false",
      colorize: process.env.NODE_ENV !== "production"
    }
  },
  
  // Health check settings
  health: {
    enabled: true,
    checks: {
      database: true,
      fivem: true,
      efibank: true,
      email: false // Don't fail health check for email issues
    }
  },
  
  // Development settings
  development: {
    // Enable detailed error messages
    verboseErrors: process.env.NODE_ENV === "development",
    
    // Enable request logging
    requestLogging: process.env.NODE_ENV === "development",
    
    // Mock external services
    mockExternalServices: process.env.MOCK_EXTERNAL_SERVICES === "true"
  },
  
  // Production settings
  production: {
    // Trust proxy headers
    trustProxy: process.env.TRUST_PROXY === "true",
    
    // Compress responses
    compression: process.env.COMPRESSION !== "false",
    
    // Security enhancements
    hidePoweredBy: true,
    hideServerHeader: true
  },
  
  // Feature flags
  features: {
    // Enable webhook endpoints
    webhooks: process.env.FEATURES_WEBHOOKS !== "false",
    
    // Enable admin endpoints
    admin: process.env.FEATURES_ADMIN !== "false",
    
    // Enable server integration
    serverIntegration: process.env.FEATURES_SERVER_INTEGRATION !== "false",
    
    // Enable analytics
    analytics: process.env.FEATURES_ANALYTICS !== "false",
    
    // Enable email notifications
    emailNotifications: process.env.FEATURES_EMAIL !== "false"
  }
};

// Validation function
export function validateServerConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!serverConfig.security.jwt.secret || serverConfig.security.jwt.secret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters long");
  }
  
  if (serverConfig.port < 1 || serverConfig.port > 65535) {
    errors.push("PORT must be between 1 and 65535");
  }
  
  if (serverConfig.environment === "production" && !serverConfig.admin.password) {
    errors.push("SUPER_ADMIN_PASSWORD is required in production");
  }
  
  if (serverConfig.fivem.serverUrl && !serverConfig.fivem.serverToken) {
    errors.push("FIVEM_SERVER_TOKEN is required when FIVEM_SERVER_URL is set");
  }
  
  if (serverConfig.email.enabled) {
    if (!serverConfig.email.smtp.host) {
      errors.push("SMTP_HOST is required when email is enabled");
    }
    if (!serverConfig.email.smtp.user) {
      errors.push("SMTP_USER is required when email is enabled");
    }
    if (!serverConfig.email.smtp.pass) {
      errors.push("SMTP_PASS is required when email is enabled");
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default serverConfig;
