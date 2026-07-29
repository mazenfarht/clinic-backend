// src/routes/index.ts

import { Router } from "express";
import type { Request, Response } from "express";
import { ApiResponse } from "../shared/utils/apiResponse";
import authRoutes from "../modules/auth/auth.routes";
import patientRoutes from "../modules/patients";
import appointmentRoutes from "../modules/appointments";
import { queueRoutes } from "../modules/queue";

const router = Router();

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

router.get("/health", (_req: Request, res: Response) => {
  ApiResponse.ok(
    res,
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: parseFloat(process.uptime().toFixed(3)),
      environment: process.env.NODE_ENV ?? "development",
    },
    "Service is healthy"
  );
});

// ---------------------------------------------------------------------------
// Module routers
// ---------------------------------------------------------------------------

router.use("/auth", authRoutes);
router.use("/patients", patientRoutes);
router.use("/appointments", appointmentRoutes);
router.use("/queue", queueRoutes);

export default router;
