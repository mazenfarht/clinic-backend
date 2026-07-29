// src/modules/patients/patient.routes.ts

import { Router } from "express";
import * as PatientController from "./patient.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireRoles } from "../auth/role.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRoles("DOCTOR", "RECEPTIONIST"));

// ---------------------------------------------------------------------------
// Collection routes
// ---------------------------------------------------------------------------

router.get("/", PatientController.listPatients);
router.post("/", PatientController.createPatient);

// ---------------------------------------------------------------------------
// Member routes
// ---------------------------------------------------------------------------

router.get("/:id", PatientController.getPatientById);
router.patch("/:id", PatientController.updatePatient);
router.delete("/:id", PatientController.deletePatient);
router.patch("/:id/restore", PatientController.restorePatient);

export default router;
