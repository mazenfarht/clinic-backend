// src/modules/doctors/doctors.routes.ts

import { Router } from "express";
import * as DoctorsController from "./doctors.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireRoles } from "../auth/role.middleware";

const router = Router();

router.use(authMiddleware);

// Receptionists need the list to book on behalf of patients
router.get(
  "/",
  requireRoles("DOCTOR", "RECEPTIONIST"),
  DoctorsController.listDoctors
);

router.post("/", requireRoles("DOCTOR"), DoctorsController.createDoctor);
router.patch("/:id", requireRoles("DOCTOR"), DoctorsController.updateDoctor);

export default router;
