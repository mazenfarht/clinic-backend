// src/modules/public/public.routes.ts

import { Router } from "express";
import * as PublicController from "./public.controller";

const router = Router();

// ---------------------------------------------------------------------------
// No auth middleware — all routes in this module are public
// ---------------------------------------------------------------------------

// GET /public/clinics/:clinicId/availability?date=YYYY-MM-DD
router.get("/clinics/:clinicId/availability", PublicController.getAvailability);

// POST /public/clinics/:clinicId/patients/lookup
router.post(
  "/clinics/:clinicId/patients/lookup",
  PublicController.lookupPatient
);

// POST /public/clinics/:clinicId/patients/register
router.post(
  "/clinics/:clinicId/patients/register",
  PublicController.registerPatient
);

// POST /public/clinics/:clinicId/appointments
router.post(
  "/clinics/:clinicId/appointments",
  PublicController.bookAppointment
);

export default router;
