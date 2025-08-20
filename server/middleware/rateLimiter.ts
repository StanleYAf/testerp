import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

const createRateLimiter = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message || "Too many requests, please try again later.",
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: message || "Too many requests, please try again later.",
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// General API rate limiter
export const generalRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  parseInt(process.env.RATE_LIMIT_MAX || "100"), // limit each IP to 100 requests per windowMs
  "Too many API requests"
);

// Strict rate limiter for authentication endpoints
export const authRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 requests per windowMs
  "Too many authentication attempts"
);

// Payment rate limiter
export const paymentRateLimit = createRateLimiter(
  60 * 1000, // 1 minute
  3, // limit each IP to 3 payment requests per minute
  "Too many payment requests"
);

// Admin rate limiter
export const adminRateLimit = createRateLimiter(
  60 * 1000, // 1 minute
  20, // limit each IP to 20 admin requests per minute
  "Too many admin requests"
);

// Webhook rate limiter (more lenient for external services)
export const webhookRateLimit = createRateLimiter(
  60 * 1000, // 1 minute
  50, // limit each IP to 50 webhook requests per minute
  "Too many webhook requests"
);
