// src/modules/auth/auth.middleware.ts

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../../config";
import prisma from "../../config/database";
import { AppError, UnauthorizedError } from "../../shared/errors/AppError";
import type { JwtAccessPayload } from "./auth.types";

// ---------------------------------------------------------------------------
// Verifies the access token AND checks the user against the database on every
// request, so that:
//   - a deactivated user (or a deactivated clinic) is locked out immediately,
//     not when the token expires;
//   - tokens revoked by logout-all / password change / deactivation
//     (tokenVersion mismatch) stop working at once;
//   - the role used for authorization is always the CURRENT one, never a stale
//     value baked into the token.
// ---------------------------------------------------------------------------

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
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

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        clinicId: true,
        role: true,
        isActive: true,
        tokenVersion: true,
        clinic: { select: { isActive: true } },
      },
    });

    if (!user || !user.clinic.isActive) {
      throw new UnauthorizedError("Invalid access token");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("Your account has been deactivated");
    }

    if (payload.tv !== user.tokenVersion) {
      throw new UnauthorizedError("Access token has been revoked");
    }

    req.user = { ...payload, clinicId: user.clinicId, role: user.role };

    next();
  } catch (err) {
    if (err instanceof AppError) {
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

    // Unexpected failure (e.g. database down) — let the error handler decide
    next(err);
  }
}
