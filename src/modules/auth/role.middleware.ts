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
