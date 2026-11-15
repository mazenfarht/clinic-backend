// src/modules/admin/auth/admin-auth.routes.ts

import { Router } from "express";
import * as AdminAuthController from "./admin-auth.controller";
import { adminAuthMiddleware } from "./admin-auth.middleware";
import { authLimiter } from "../../../middleware/rateLimiter.middleware";

const router = Router();

// Public — blocks password brute-forcing (10 attempts / 15 min / IP)
router.post("/login", authLimiter, AdminAuthController.login);

// Protected — valid admin token required
router.get("/me", adminAuthMiddleware, AdminAuthController.me);
router.post("/logout", adminAuthMiddleware, AdminAuthController.logout);
router.patch(
  "/change-password",
  authLimiter, // also guards against guessing the current password with a stolen token
  adminAuthMiddleware,
  AdminAuthController.changePassword
);

export default router;
