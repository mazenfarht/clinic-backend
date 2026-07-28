// src/server.ts

import "dotenv/config";
import http from "http";
import app from "./app";
import config from "./config";
import { connectDatabase, disconnectDatabase } from "./config";
import { logger } from "./middleware/requestLogger.middleware";

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[Server] ${signal} received — starting graceful shutdown`);

  server.close(async (err) => {
    if (err) {
      logger.error("[Server] Error closing HTTP server", {
        error: err.message,
      });
      process.exit(1);
    }

    try {
      await disconnectDatabase();
      logger.info("[Server] Shutdown complete");
      process.exit(0);
    } catch (disconnectErr) {
      logger.error("[Server] Error disconnecting database", {
        error:
          disconnectErr instanceof Error
            ? disconnectErr.message
            : String(disconnectErr),
      });
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown takes longer than 10 seconds
  setTimeout(() => {
    logger.error("[Server] Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

// ---------------------------------------------------------------------------
// Unhandled rejection and exception handlers
// ---------------------------------------------------------------------------

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("[Process] Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  shutdown("unhandledRejection");
});

process.on("uncaughtException", (err: Error) => {
  logger.error("[Process] Uncaught exception", {
    message: err.message,
    stack: err.stack,
  });
  shutdown("uncaughtException");
});

// ---------------------------------------------------------------------------
// Termination signals
// ---------------------------------------------------------------------------

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  try {
    await connectDatabase();

    server.listen(config.server.port, config.server.host, () => {
      logger.info("[Server] Started successfully", {
        host: config.server.host,
        port: config.server.port,
        environment: config.env,
        apiBase: `/api/v1`,
      });
    });
  } catch (err) {
    logger.error("[Server] Failed to start", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

start();
