// src/modules/users/users.routes.ts

import { Router } from "express";
import * as UsersController from "./users.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireClinicAdmin } from "../auth/role.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// POST /users/receptionist
// Requires: valid access token + clinic administrator
// ---------------------------------------------------------------------------

router.post(
  "/receptionist",
  authMiddleware,
  requireClinicAdmin,
  UsersController.createReceptionist
);

// ---------------------------------------------------------------------------
// GET /users               — list the clinic's accounts
// PATCH /users/:id/status  — activate / deactivate (ends their sessions)
// Requires: clinic administrator
// ---------------------------------------------------------------------------

router.get(
  "/",
  authMiddleware,
  requireClinicAdmin,
  UsersController.listUsers
);

router.patch(
  "/:id/status",
  authMiddleware,
  requireClinicAdmin,
  UsersController.setUserStatus
);

// ---------------------------------------------------------------------------
// PATCH /users/:id/admin — grant / revoke clinic administrator on a doctor
// Requires: clinic administrator
// ---------------------------------------------------------------------------

router.patch(
  "/:id/admin",
  authMiddleware,
  requireClinicAdmin,
  UsersController.setUserAdmin
);

export default router;
