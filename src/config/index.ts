// src/config/index.ts

import prisma from "./database";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `[Config] Environment variable ${key} must be an integer, got: "${raw}"`
    );
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Config object — built once, exported as a frozen object so no module can
// mutate it at runtime.
// ---------------------------------------------------------------------------

function buildConfig() {
  return Object.freeze({
    env: optionalEnv("NODE_ENV", "development") as
      | "development"
      | "production"
      | "test",
    isProduction: process.env.NODE_ENV === "production",
    isDevelopment: process.env.NODE_ENV === "development",
    isTest: process.env.NODE_ENV === "test",

    server: Object.freeze({
      port: optionalIntEnv("PORT", 5000),
      host: optionalEnv("HOST", "0.0.0.0"),
    }),

    database: Object.freeze({
      url: requireEnv("DATABASE_URL"),
    }),

    jwt: Object.freeze({
      secret: requireEnv("JWT_SECRET"),
      expiresIn: optionalEnv("JWT_EXPIRES_IN", "7d"),
      refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
      refreshExpiresIn: optionalEnv("JWT_REFRESH_EXPIRES_IN", "30d"),
    }),

    bcrypt: Object.freeze({
      saltRounds: optionalIntEnv("BCRYPT_SALT_ROUNDS", 12),
    }),

    rateLimit: Object.freeze({
      windowMs: optionalIntEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000), // 15 minutes
      max: optionalIntEnv("RATE_LIMIT_MAX", 100),
    }),

    cors: Object.freeze({
      origin: optionalEnv("CORS_ORIGIN", "http://localhost:3000"),
    }),

    logs: Object.freeze({
      level: optionalEnv("LOG_LEVEL", "info"),
      dir: optionalEnv("LOG_DIR", "logs"),
    }),
  });
}

// ---------------------------------------------------------------------------
// Export type so other modules can type-hint config without importing the
// value (useful for mocking in tests).
// ---------------------------------------------------------------------------
export type AppConfig = ReturnType<typeof buildConfig>;

// ---------------------------------------------------------------------------
// Singleton — validate and freeze once when the module is first imported.
// Any missing required variable throws here, before the HTTP server starts.
// ---------------------------------------------------------------------------
const config: AppConfig = buildConfig();

export default config;

// ---------------------------------------------------------------------------
// Database connectivity check.
// Called explicitly by server.ts during startup — not at import time.
// ---------------------------------------------------------------------------
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  console.info("[Database] Connection established successfully.");
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.info("[Database] Connection closed.");
}
