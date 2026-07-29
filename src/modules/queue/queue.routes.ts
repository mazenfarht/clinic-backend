// src/modules/queue/queue.routes.ts

import { Router } from "express";
import * as QueueController from "./queue.controller";
import { authMiddleware } from "../auth/auth.middleware";
import { requireRoles } from "../auth/role.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRoles("DOCTOR", "RECEPTIONIST"));

// ---------------------------------------------------------------------------
// Collection routes
// ---------------------------------------------------------------------------

router.get("/", QueueController.getQueue);
router.get("/status", QueueController.getQueueStatus);
router.get("/statistics", QueueController.getQueueStatistics);

// ---------------------------------------------------------------------------
// Action routes
// ---------------------------------------------------------------------------

router.post("/check-in", QueueController.checkIn);
router.post("/reserve", QueueController.reserveSlot);
router.post("/call-next", QueueController.callNext);
router.post("/reset", QueueController.resetQueue);

// ---------------------------------------------------------------------------
// Member routes
// ---------------------------------------------------------------------------

router.get("/:id", QueueController.getQueueEntryById);
router.patch("/:id/serve", QueueController.markServed);
router.patch("/:id/skip", QueueController.skipPatient);
router.patch("/:id/recall", QueueController.recallPatient);
router.patch("/:id/cancel", QueueController.cancelQueueEntry);

export default router;
