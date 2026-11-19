// src/modules/clinic-settings/clinic-settings.routes.ts

import { Router } from "express";
import * as ClinicSettingsController from "./clinic-settings.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireClinicAdmin, requireRoles } from "../auth/role.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRoles("DOCTOR"));

// ---------------------------------------------------------------------------
// Clinic settings routes
// ---------------------------------------------------------------------------

router.get("/", ClinicSettingsController.getClinicSettings);
// Reading is open to every doctor; changing the clinic is admin-only.
router.patch(
  "/",
  requireClinicAdmin,
  ClinicSettingsController.updateClinicSettings
);

export default router;
