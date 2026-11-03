// src/modules/auth/auth.routes.ts

import { Router } from "express";
import * as AuthController from "./auth.controller";
import { authMiddleware } from "./auth.middleware";
import { authLimiter } from "../../middleware/rateLimiter.middleware";
const router = Router();

// ---------------------------------------------------------------------------
// Public routes — no authentication required
// ---------------------------------------------------------------------------

router.post("/login", authLimiter, AuthController.login);
router.post("/refresh", authLimiter, AuthController.refresh);

// ---------------------------------------------------------------------------
// Protected routes — valid access token required
// ---------------------------------------------------------------------------

router.post("/logout", authMiddleware, AuthController.logout);
router.get("/me", authMiddleware, AuthController.me);
router.patch("/change-password", authMiddleware, AuthController.changePassword);

export default router;
