// src/modules/admin/auth/admin-auth.middleware.ts

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../../../config";
import prisma from "../../../config/database";
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
} from "../../../shared/errors/AppError";
import type { JwtAdminPayload } from "./admin-auth.types";

// ---------------------------------------------------------------------------
// Protects every /admin route (except login). Same guarantees as the clinic
// authMiddleware, for platform admins:
//   - the token is signed with ADMIN_JWT_SECRET, so a clinic token fails the
//     signature check here and an admin token fails it on clinic routes;
//   - the admin is re-read from the database on every request, so a
//     deactivated admin or a token revoked by logout / password change
//     (tokenVersion mismatch) stops working at once.
// ---------------------------------------------------------------------------

export async function adminAuthMiddleware(
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
      throw new UnauthorizedError("Authorization header must use Bearer scheme");
    }

    const token = authHeader.slice(7);

    if (!token) {
      throw new UnauthorizedError("Access token is missing");
    }

    const payload = jwt.verify(token, config.adminJwt.secret, {
      algorithms: ["HS256"],
    }) as JwtAdminPayload;

    if (payload.type !== "admin" || typeof payload.sub !== "string") {
      throw new UnauthorizedError("Invalid token type");
    }

    const admin = await prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!admin) {
      throw new UnauthorizedError("Invalid access token");
    }

    if (!admin.isActive) {
      throw new ForbiddenError("This admin account has been deactivated");
    }

    if (payload.tv !== admin.tokenVersion) {
      throw new UnauthorizedError("Access token has been revoked");
    }

    req.admin = { id: admin.id, email: admin.email, fullName: admin.fullName };

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
