// src/app.ts

import express, { Application } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { requestLoggerMiddleware } from "./middleware/requestLogger.middleware";
import { notFoundMiddleware } from "./middleware/notFound.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import router from "./routes";
import config from "./config";

const app: Application = express();

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

app.use(helmet());

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

app.use(
  cors({
    origin: config.cors.origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ---------------------------------------------------------------------------
// Body parsers
// ---------------------------------------------------------------------------

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ---------------------------------------------------------------------------
// Response compression
// ---------------------------------------------------------------------------

app.use(compression());

// ---------------------------------------------------------------------------
// Request logging — before routes so every request is captured
// ---------------------------------------------------------------------------

app.use(requestLoggerMiddleware);

// ---------------------------------------------------------------------------
// Global rate limiter
// ---------------------------------------------------------------------------

const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  skip: () => config.isTest,
});

app.use(globalLimiter);

// ---------------------------------------------------------------------------
// Trust proxy — required when running behind Nginx, AWS ALB, or any reverse
// proxy so req.ip reflects the real client IP, not the proxy IP.
// ---------------------------------------------------------------------------

app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use("/api/v1", router);

// ---------------------------------------------------------------------------
// 404 handler — must come after all valid routes
// ---------------------------------------------------------------------------

app.use(notFoundMiddleware);

// ---------------------------------------------------------------------------
// Global error handler — must be last, must have 4 parameters
// ---------------------------------------------------------------------------

app.use(errorMiddleware);

export default app;
