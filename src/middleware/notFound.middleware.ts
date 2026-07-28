// src/middleware/notFound.middleware.ts

import { Request, Response, NextFunction } from "express";
import { AppError, HttpStatus } from "../shared/errors/AppError";

export function notFoundMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(
    new AppError(
      `Route not found: ${req.method} ${req.originalUrl}`,
      HttpStatus.NOT_FOUND
    )
  );
}
