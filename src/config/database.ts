// src/config/database.ts

import { PrismaClient, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Type augmentation — teaches TypeScript that globalThis can hold our client.
// Without this, accessing globalThis.__prisma would be a type error.
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// ---------------------------------------------------------------------------
// Log configuration per environment.
//
// Development  → emit 'query' so engineers can see every SQL statement and
//                catch N+1 problems during feature development.
// Production   → emit only 'warn' and 'error' to keep log volume low.
//                'info' is excluded because it logs on every $connect call.
// ---------------------------------------------------------------------------
const developmentLogLevels: Prisma.LogLevel[] = [
  "query",
  "info",
  "warn",
  "error",
];
const productionLogLevels: Prisma.LogLevel[] = ["warn", "error"];

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? productionLogLevels
        : developmentLogLevels,
    errorFormat:
      process.env.NODE_ENV === "production"
        ? "minimal" // shorter messages, no colour codes in log files
        : "pretty", // coloured, multi-line output in the terminal
  });
}

// ---------------------------------------------------------------------------
// Singleton pattern.
//
// In production:  the module is loaded once and never reloaded — the simple
//                 assignment on the right side of `??=` runs exactly once.
//
// In development: nodemon / ts-node-dev clears Node's require cache on each
//                 restart. Without the globalThis guard, every restart would
//                 create a new PrismaClient (and a new connection pool) while
//                 the old one was never disconnected, leaking connections.
//                 Storing the instance on globalThis survives the cache clear.
// ---------------------------------------------------------------------------
const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export default prisma;
