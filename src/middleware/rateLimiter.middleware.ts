// src/middleware/rateLimiter.middleware.ts

import rateLimit from "express-rate-limit";
import type { Request } from "express";
import config from "../config";

function build(
  windowMs: number,
  limit: number,
  message: string,
  extraSkip?: (req: Request) => boolean
) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skip: (req) => config.isTest || (extraSkip ? extraSkip(req) : false),
  });
}

// The waiting-room TV polls every few seconds, so it gets its own, higher limit
// and is excluded from the global one.
const isWaitingScreen = (req: Request) =>
  req.path.startsWith("/api/v1/public/clinics/") &&
  req.path.endsWith("/waiting-screen");

/** Applied to every request (except the waiting-room screen). */
export const globalLimiter = build(
  config.rateLimit.windowMs,
  config.rateLimit.max,
  "Too many requests from this IP, please try again later.",
  isWaitingScreen
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

/** Public waiting-room screen: 60 requests / minute / IP (≈ one every second). */
export const waitingScreenLimiter = build(
  60 * 1000,
  60,
  "Too many requests, please slow down the refresh rate."
);
