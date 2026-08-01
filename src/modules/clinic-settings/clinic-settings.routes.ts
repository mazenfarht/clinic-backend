// src/modules/clinic-settings/clinic-settings.routes.ts

import { Router } from "express";
import * as ClinicSettingsController from "./clinic-settings.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireRoles } from "../auth/role.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRoles("DOCTOR", "RECEPTIONIST"));

// ---------------------------------------------------------------------------
// Clinic settings routes
// ---------------------------------------------------------------------------

router.get("/", ClinicSettingsController.getClinicSettings);
router.patch("/", ClinicSettingsController.updateClinicSettings);

export default router;
