// src/modules/admin/clinics/admin-clinics.routes.ts
//
// Mounted behind adminAuthMiddleware (see admin.routes.ts).

import { Router } from "express";
import * as Controller from "./admin-clinics.controller";
import { adminWriteLimiter } from "../../../middleware/rateLimiter.middleware";

const router = Router();

router.get("/", Controller.listClinics);
router.post("/", adminWriteLimiter, Controller.createClinic);

router.get("/:id", Controller.getClinic);
router.patch("/:id", adminWriteLimiter, Controller.updateClinic);
router.patch("/:id/status", adminWriteLimiter, Controller.setClinicStatus);

router.post("/:id/doctors", adminWriteLimiter, Controller.addDoctor);
router.post(
  "/:id/users/:userId/reset-password",
  adminWriteLimiter,
  Controller.resetUserPassword
);

export default router;
