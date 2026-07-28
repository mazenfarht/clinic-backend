// src/middleware/auth.middleware.ts

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../../config";
import { UnauthorizedError } from "../../shared/errors/AppError";
import type { JwtAccessPayload } from "./auth.types";
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError("Authorization header is missing");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError(
        "Authorization header must use Bearer scheme"
      );
    }

    const token = authHeader.slice(7);

    if (!token) {
      throw new UnauthorizedError("Access token is missing");
    }

    const payload = jwt.verify(token, config.jwt.secret) as JwtAccessPayload;

    if (payload.type !== "access") {
      throw new UnauthorizedError("Invalid token type");
    }

    req.user = payload;

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
      return;
    }

    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError("Access token has expired"));
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError("Invalid access token"));
      return;
    }

    if (err instanceof jwt.NotBeforeError) {
      next(new UnauthorizedError("Token not yet active"));
      return;
    }

    next(new UnauthorizedError("Authentication failed"));
  }
}
