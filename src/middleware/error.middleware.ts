// src/middleware/error.middleware.ts

import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { AppError, HttpStatus } from "../shared/errors/AppError";
import { ApiResponse } from "../shared/utils/apiResponse";
import config from "../config";

// ---------------------------------------------------------------------------
// Prisma error mapping
// ---------------------------------------------------------------------------

function handlePrismaError(
  err: Prisma.PrismaClientKnownRequestError
): AppError {
  switch (err.code) {
    case "P2002": {
      const fields = (err.meta?.target as string[])?.join(", ") ?? "field";
      return new AppError(
        `A record with this ${fields} already exists.`,
        HttpStatus.CONFLICT
      );
    }

    case "P2025":
      return new AppError(
        "The requested record was not found.",
        HttpStatus.NOT_FOUND
      );

    case "P2003": {
      const field = (err.meta?.field_name as string) ?? "field";
      return new AppError(
        `Referenced record not found for field: ${field}.`,
        HttpStatus.BAD_REQUEST
      );
    }

    case "P2014":
      return new AppError(
        "This operation violates a required relation between records.",
        HttpStatus.BAD_REQUEST
      );

    case "P2021":
      return new AppError(
        "Database table does not exist. Run prisma migrate deploy.",
        HttpStatus.INTERNAL_SERVER_ERROR,
        false
      );

    case "P2022":
      return new AppError(
        "Database column does not exist. Run prisma migrate deploy.",
        HttpStatus.INTERNAL_SERVER_ERROR,
        false
      );

    default:
      return new AppError(
        "A database error occurred.",
        HttpStatus.INTERNAL_SERVER_ERROR,
        false
      );
  }
}

function handlePrismaValidationError(
  _err: Prisma.PrismaClientValidationError
): AppError {
  return new AppError(
    "Invalid data provided to the database layer.",
    HttpStatus.BAD_REQUEST
  );
}

function handlePrismaInitializationError(
  _err: Prisma.PrismaClientInitializationError
): AppError {
  return new AppError(
    "Unable to reach the database. Please try again later.",
    HttpStatus.SERVICE_UNAVAILABLE,
    false
  );
}

// ---------------------------------------------------------------------------
// JWT error mapping
// ---------------------------------------------------------------------------

function handleJwtError(err: Error): AppError {
  if (err.name === "JsonWebTokenError") {
    return new AppError(
      "Invalid token. Please log in again.",
      HttpStatus.UNAUTHORIZED
    );
  }
  if (err.name === "TokenExpiredError") {
    return new AppError(
      "Your session has expired. Please log in again.",
      HttpStatus.UNAUTHORIZED
    );
  }
  if (err.name === "NotBeforeError") {
    return new AppError("Token not yet active.", HttpStatus.UNAUTHORIZED);
  }
  return new AppError("Authentication failed.", HttpStatus.UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// Normalise any thrown value into an AppError
// ---------------------------------------------------------------------------

function normaliseError(err: unknown): AppError {
  // Already an AppError — pass through
  if (err instanceof AppError) {
    return err;
  }

  // Prisma known request error (constraint violations, not-found, etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(err);
  }

  // Prisma validation error (wrong field types sent to Prisma)
  if (err instanceof Prisma.PrismaClientValidationError) {
    return handlePrismaValidationError(err);
  }

  // Prisma initialisation error (cannot reach DB)
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return handlePrismaInitializationError(err);
  }

  // JWT errors
  if (
    err instanceof Error &&
    ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
      err.name
    )
  ) {
    return handleJwtError(err);
  }

  // Express body-parser errors
  if (err instanceof SyntaxError && "body" in err) {
    return new AppError(
      "Malformed JSON in request body.",
      HttpStatus.BAD_REQUEST
    );
  }

  // Generic Error — non-operational, something unexpected
  if (err instanceof Error) {
    return new AppError(
      config.isProduction ? "An unexpected error occurred." : err.message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      false
    );
  }

  // Unknown throw (e.g. throw 'string' or throw 42)
  return new AppError(
    "An unexpected error occurred.",
    HttpStatus.INTERNAL_SERVER_ERROR,
    false
  );
}

// ---------------------------------------------------------------------------
// Global error handler middleware
// Must have exactly 4 parameters for Express to treat it as an error handler.
// ---------------------------------------------------------------------------

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const appError = normaliseError(err);

  // Log non-operational errors with full detail — these are bugs
  if (!appError.isOperational) {
    console.error("[Unhandled Error]", {
      message: appError.message,
      stack: appError.stack,
      url: req.url,
      method: req.method,
    });
  }

  ApiResponse.error(
    res,
    appError.statusCode,
    appError.message,
    appError.errors,
    !config.isProduction && !appError.isOperational ? appError.stack : undefined
  );
}
