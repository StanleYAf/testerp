import { z } from "zod";

// Custom validators
export const validators = {
  // Email validation
  email: z.string().email("Invalid email format").toLowerCase(),

  // Strong password validation
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/\d/, "Password must contain at least one number"),

  // Username validation
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),

  // FiveM identifier validation
  fivemIdentifier: z.string()
    .regex(/^(steam|license|discord|fivem|live|xbl):[a-zA-Z0-9]+$/, "Invalid FiveM identifier format")
    .optional(),

  // Discord ID validation
  discordId: z.string()
    .regex(/^\d{17,19}$/, "Invalid Discord ID format")
    .optional(),

  // Price validation
  price: z.number()
    .positive("Price must be positive")
    .max(999999.99, "Price too high"),

  // Quantity validation
  quantity: z.number()
    .int("Quantity must be an integer")
    .positive("Quantity must be positive")
    .max(1000, "Quantity too high"),

  // Product code validation
  productCode: z.string()
    .min(3, "Product code must be at least 3 characters")
    .max(50, "Product code must be at most 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Product code can only contain letters, numbers, hyphens, and underscores"),

  // URL validation
  url: z.string().url("Invalid URL format").optional(),

  // Phone validation (Brazilian format)
  phone: z.string()
    .regex(/^\+55\d{2}\d{8,9}$/, "Invalid Brazilian phone format (+55XXXXXXXXXXX)")
    .optional(),

  // PIX key validation
  pixKey: z.string()
    .min(1, "PIX key is required")
    .max(77, "PIX key too long"),

  // Amount validation for payments
  paymentAmount: z.number()
    .positive("Amount must be positive")
    .min(0.01, "Minimum amount is R$ 0.01")
    .max(50000, "Maximum amount is R$ 50,000.00"),

  // VIP level validation
  vipLevel: z.enum(["none", "bronze", "silver", "gold", "diamond"], {
    errorMap: () => ({ message: "Invalid VIP level" })
  }),

  // Product type validation
  productType: z.enum(["coins", "vip", "vehicle", "weapon", "item"], {
    errorMap: () => ({ message: "Invalid product type" })
  }),

  // Status validations
  transactionStatus: z.enum(["pending", "approved", "cancelled", "failed"], {
    errorMap: () => ({ message: "Invalid transaction status" })
  }),

  grantStatus: z.enum(["pending", "delivered", "failed"], {
    errorMap: () => ({ message: "Invalid grant status" })
  }),

  userRole: z.enum(["user", "admin", "super_admin"], {
    errorMap: () => ({ message: "Invalid user role" })
  }),

  // Date validation
  futureDate: z.date().refine(date => date > new Date(), {
    message: "Date must be in the future"
  }),

  // JSON validation
  jsonString: z.string().refine(val => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, "Invalid JSON format"),

  // Pagination validation
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  }),

  // Search validation
  searchQuery: z.string()
    .min(1, "Search query cannot be empty")
    .max(100, "Search query too long")
    .trim(),

  // IP address validation
  ipAddress: z.string().ip("Invalid IP address"),

  // UUID validation
  uuid: z.string().uuid("Invalid UUID format"),

  // Positive integer validation
  positiveInt: z.number().int().positive(),

  // Non-negative integer validation
  nonNegativeInt: z.number().int().min(0),

  // Currency validation
  currency: z.enum(["BRL", "USD", "EUR"], {
    errorMap: () => ({ message: "Invalid currency" })
  })
};

// Composite validation schemas
export const registerValidation = z.object({
  username: validators.username,
  email: validators.email,
  password: validators.password,
  confirmPassword: z.string(),
  fivemIdentifier: validators.fivemIdentifier,
  discordId: validators.discordId
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const loginValidation = z.object({
  email: validators.email,
  password: z.string().min(1, "Password is required")
});

export const createProductValidation = z.object({
  code: validators.productCode,
  name: z.string().min(1, "Product name is required").max(100),
  description: z.string().max(1000).optional(),
  price: validators.price,
  type: validators.productType,
  data: z.record(z.any()).optional(),
  stock: z.number().int().min(-1).default(-1),
  category: z.string().max(50).optional(),
  imageUrl: validators.url
});

export const updateUserValidation = z.object({
  username: validators.username.optional(),
  email: validators.email.optional(),
  fivemIdentifier: validators.fivemIdentifier,
  discordId: validators.discordId,
  vipLevel: validators.vipLevel.optional(),
  vipExpires: z.date().optional()
}).partial();

export const createPaymentValidation = z.object({
  items: z.array(z.object({
    productId: validators.positiveInt,
    quantity: validators.quantity
  })).min(1, "At least one item is required"),
  paymentMethod: z.string().default("pix")
});
