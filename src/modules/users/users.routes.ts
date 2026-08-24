// src/modules/users/users.routes.ts

import { Router } from "express";
import * as UsersController from "./users.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireRoles } from "../auth/role.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// POST /users/receptionist
// Requires: valid access token + DOCTOR role
// ---------------------------------------------------------------------------

router.post(
  "/receptionist",
  authMiddleware,
  requireRoles("DOCTOR"),
  UsersController.createReceptionist
);

export default router;
