// src/middleware/rateLimiter.middleware.ts

import rateLimit from "express-rate-limit";
import config from "../config";

function build(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skip: () => config.isTest,
  });
}

/** Applied to every request. */
export const globalLimiter = build(
  config.rateLimit.windowMs,
  config.rateLimit.max,
  "Too many requests from this IP, please try again later."
);

/** Login / refresh — blocks password brute-forcing. */
export const authLimiter = build(
  15 * 60 * 1000,
  10,
  "Too many authentication attempts, please try again in 15 minutes."
);

/** Public patient lookup / register — blocks phone-number enumeration and spam. */
export const publicWriteLimiter = build(
  15 * 60 * 1000,
  20,
  "Too many requests, please try again later."
);
