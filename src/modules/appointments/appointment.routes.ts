// src/modules/appointments/appointment.routes.ts

import { Router } from "express";
import * as AppointmentController from "./appointment.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireRoles } from "../auth/role.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRoles("DOCTOR", "RECEPTIONIST"));

// ---------------------------------------------------------------------------
// Collection routes
// ---------------------------------------------------------------------------

router.get("/", AppointmentController.listAppointments);
router.post("/", AppointmentController.createAppointment);

// ---------------------------------------------------------------------------
// Member routes
// ---------------------------------------------------------------------------

router.get("/:id", AppointmentController.getAppointmentById);
router.patch("/:id", AppointmentController.updateAppointment);
router.patch("/:id/cancel", AppointmentController.cancelAppointment);
router.patch("/:id/complete", AppointmentController.completeAppointment);

export default router;
