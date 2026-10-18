// src/modules/public/public.routes.ts

import { Router } from "express";
import * as PublicController from "./public.controller";
import { publicWriteLimiter } from "../../middleware/rateLimiter.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// No auth middleware — all routes in this module are public
// ---------------------------------------------------------------------------

// GET /public/clinics/:clinicId/doctors
router.get("/clinics/:clinicId/doctors", PublicController.listDoctors);

// GET /public/clinics/:clinicId/availability?doctorId=...&date=YYYY-MM-DD
router.get("/clinics/:clinicId/availability", PublicController.getAvailability);

// POST /public/clinics/:clinicId/patients/lookup
router.post(
  "/clinics/:clinicId/patients/lookup",
  publicWriteLimiter,
  PublicController.lookupPatient
);

// POST /public/clinics/:clinicId/patients/register
router.post(
  "/clinics/:clinicId/patients/register",
  publicWriteLimiter,
  PublicController.registerPatient
);

// POST /public/clinics/:clinicId/appointments
router.post(
  "/clinics/:clinicId/appointments",
  publicWriteLimiter,
  PublicController.bookAppointment
);

export default router;
