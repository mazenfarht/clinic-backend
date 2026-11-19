// src/middleware/role.middleware.ts

import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import {
  UnauthorizedError,
  ForbiddenError,
} from "../../shared/errors/AppError";
export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(
        new ForbiddenError(
          `Access denied. Required role: ${roles.join(" or ")}`
        )
      );
      return;
    }

    next();
  };
}

/**
 * Clinic administrator gate: a DOCTOR whose account carries isClinicAdmin.
 * Used for clinic settings and staff management. The flag is read from the
 * database by authMiddleware on every request, so revoking it takes effect
 * immediately.
 */
export function requireClinicAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next(new UnauthorizedError("Authentication required"));
    return;
  }

  if (req.user.role !== "DOCTOR" || !req.user.isClinicAdmin) {
    next(
      new ForbiddenError(
        "Access denied. Clinic administrator privileges are required"
      )
    );
    return;
  }

  next();
}
