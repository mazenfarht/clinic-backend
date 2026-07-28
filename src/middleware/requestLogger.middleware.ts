// src/middleware/requestLogger.middleware.ts

import { Request, Response, NextFunction } from "express";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import config from "../config";

// ---------------------------------------------------------------------------
// Winston logger instance
// ---------------------------------------------------------------------------

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const developmentFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return stack
      ? `[${timestamp}] ${level}: ${message}\n${stack}${metaStr}`
      : `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

const productionFormat = combine(timestamp(), errors({ stack: true }), json());

const transports: winston.transport[] = [
  new winston.transports.Console({
    silent: config.isTest,
  }),
];

if (config.isProduction) {
  transports.push(
    new DailyRotateFile({
      dirname: config.logs.dir,
      filename: "combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d",
      level: "info",
    }),
    new DailyRotateFile({
      dirname: config.logs.dir,
      filename: "error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d",
      level: "error",
    })
  );
}

export const logger = winston.createLogger({
  level: config.logs.level,
  format: config.isProduction ? productionFormat : developmentFormat,
  transports,
  exitOnError: false,
});

// ---------------------------------------------------------------------------
// Request logger middleware
// ---------------------------------------------------------------------------

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = process.hrtime.bigint();

  const { method, originalUrl, ip } = req;
  const userAgent = req.get("user-agent") ?? "unknown";

  res.on("finish", () => {
    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(durationNs) / 1_000_000;
    const { statusCode } = res;

    const logData = {
      method,
      url: originalUrl,
      statusCode,
      durationMs: parseFloat(durationMs.toFixed(3)),
      ip,
      userAgent,
    };

    if (statusCode >= 500) {
      logger.error("Request completed", logData);
    } else if (statusCode >= 400) {
      logger.warn("Request completed", logData);
    } else {
      logger.info("Request completed", logData);
    }
  });

  next();
}
