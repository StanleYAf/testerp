export const efiBankConfig = {
  // API Credentials
  clientId: process.env.EFI_CLIENT_ID || "",
  clientSecret: process.env.EFI_CLIENT_SECRET || "",
  
  // PIX Configuration
  pixKey: process.env.EFI_PIX_KEY || "",
  
  // API URLs
  baseUrl: process.env.EFI_BASE_URL || "https://api-pix.gerencianet.com.br",
  sandboxUrl: "https://api-pix-h.gerencianet.com.br",
  
  // Environment
  environment: process.env.EFI_ENVIRONMENT || "production", // "production" or "sandbox"
  
  // Webhook Configuration
  webhook: {
    url: process.env.EFI_WEBHOOK_URL || "",
    secret: process.env.EFI_WEBHOOK_SECRET || "",
    
    // Webhook events to listen for
    events: [
      "pix",
      "charge_back",
      "cancellation"
    ]
  },
  
  // Payment Settings
  payment: {
    // Default expiration time for PIX payments (in seconds)
    defaultExpiration: parseInt(process.env.EFI_DEFAULT_EXPIRATION || "900"), // 15 minutes
    
    // Minimum and maximum payment amounts (in BRL)
    minAmount: parseFloat(process.env.EFI_MIN_AMOUNT || "0.01"),
    maxAmount: parseFloat(process.env.EFI_MAX_AMOUNT || "50000.00"),
    
    // Currency
    currency: "BRL",
    
    // Allowed payment methods
    allowedMethods: ["pix"],
    
    // Auto-cancel expired payments
    autoCancelExpired: process.env.EFI_AUTO_CANCEL === "true"
  },
  
  // Security Settings
  security: {
    // Validate webhook signatures
    validateWebhookSignature: process.env.EFI_VALIDATE_SIGNATURE !== "false",
    
    // API request timeout (milliseconds)
    timeout: parseInt(process.env.EFI_TIMEOUT || "30000"),
    
    // Retry settings for failed API calls
    retry: {
      attempts: parseInt(process.env.EFI_RETRY_ATTEMPTS || "3"),
      delay: parseInt(process.env.EFI_RETRY_DELAY || "1000") // milliseconds
    }
  },
  
  // Rate Limiting
  rateLimit: {
    // Requests per minute
    requestsPerMinute: parseInt(process.env.EFI_RATE_LIMIT || "60"),
    
    // Burst limit
    burstLimit: parseInt(process.env.EFI_BURST_LIMIT || "10")
  },
  
  // Logging
  logging: {
    // Log all API requests/responses
    logRequests: process.env.EFI_LOG_REQUESTS === "true",
    
    // Log webhook events
    logWebhooks: process.env.EFI_LOG_WEBHOOKS === "true",
    
    // Mask sensitive data in logs
    maskSensitiveData: process.env.EFI_MASK_SENSITIVE !== "false"
  },
  
  // Feature Flags
  features: {
    // Enable automatic payment status checking
    autoStatusCheck: process.env.EFI_AUTO_STATUS_CHECK === "true",
    
    // Enable payment confirmation emails
    confirmationEmails: process.env.EFI_CONFIRMATION_EMAILS === "true",
    
    // Enable QR code generation
    generateQrCodes: process.env.EFI_GENERATE_QR_CODES !== "false"
  },
  
  // Error Handling
  errorHandling: {
    // Retry failed payments
    retryFailedPayments: process.env.EFI_RETRY_FAILED === "true",
    
    // Fallback to mock mode if API is unavailable
    fallbackToMock: process.env.EFI_FALLBACK_MOCK === "true",
    
    // Email admin on critical errors
    emailOnError: process.env.EFI_EMAIL_ON_ERROR === "true"
  }
};

// Validation function
export function validateEfiBankConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!efiBankConfig.clientId && efiBankConfig.environment === "production") {
    errors.push("EFI_CLIENT_ID is required for production environment");
  }
  
  if (!efiBankConfig.clientSecret && efiBankConfig.environment === "production") {
    errors.push("EFI_CLIENT_SECRET is required for production environment");
  }
  
  if (!efiBankConfig.pixKey && efiBankConfig.environment === "production") {
    errors.push("EFI_PIX_KEY is required for production environment");
  }
  
  if (efiBankConfig.webhook.url && !efiBankConfig.webhook.secret) {
    errors.push("EFI_WEBHOOK_SECRET is required when webhook URL is configured");
  }
  
  if (efiBankConfig.payment.minAmount <= 0) {
    errors.push("Minimum payment amount must be greater than 0");
  }
  
  if (efiBankConfig.payment.maxAmount <= efiBankConfig.payment.minAmount) {
    errors.push("Maximum payment amount must be greater than minimum amount");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default efiBankConfig;
