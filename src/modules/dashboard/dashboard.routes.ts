// src/modules/dashboard/dashboard.routes.ts

import { Router } from "express";
import * as DashboardController from "./dashboard.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireRoles } from "../auth/role.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRoles("DOCTOR", "RECEPTIONIST"));

// ---------------------------------------------------------------------------
// Dashboard routes
// ---------------------------------------------------------------------------

router.get("/overview", DashboardController.getOverview);
router.get("/today", DashboardController.getToday);
router.get("/queue", DashboardController.getQueueDashboard);
router.get("/appointments", DashboardController.getAppointmentsDashboard);
router.get("/patients", DashboardController.getPatientsDashboard);
router.get("/analytics", DashboardController.getAnalytics);

export default router;
