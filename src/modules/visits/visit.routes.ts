// src/modules/visits/visit.routes.ts

import { Router } from "express";
import * as VisitController from "./visit.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireRoles } from "../auth/role.middleware";

const router = Router();
const patientRouter = Router({ mergeParams: true });

router.use(authMiddleware);
patientRouter.use(authMiddleware);

// ---------------------------------------------------------------------------
// Collection routes — all authenticated users can view
// ---------------------------------------------------------------------------

router.get(
  "/",
  requireRoles("DOCTOR", "RECEPTIONIST"),
  VisitController.listVisits
);
router.get(
  "/:id",
  requireRoles("DOCTOR", "RECEPTIONIST"),
  VisitController.getVisitById
);

// ---------------------------------------------------------------------------
// Mutation routes — DOCTOR only
// ---------------------------------------------------------------------------

router.post("/", requireRoles("DOCTOR"), VisitController.createVisit);
router.patch("/:id", requireRoles("DOCTOR"), VisitController.updateVisit);
router.delete("/:id", requireRoles("DOCTOR"), VisitController.deleteVisit);

// ---------------------------------------------------------------------------
// Patient-scoped visit routes
// ---------------------------------------------------------------------------

patientRouter.get(
  "/",
  requireRoles("DOCTOR", "RECEPTIONIST"),
  VisitController.listVisitsByPatient
);

export default router;
export { patientRouter as patientVisitRouter };
