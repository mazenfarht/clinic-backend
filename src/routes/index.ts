// src/routes/index.ts

import { Router, Request, Response } from "express";
import { ApiResponse } from "../shared/utils/apiResponse";

const router = Router();

// ---------------------------------------------------------------------------
// Health check — used by Docker, load balancers, and uptime monitors to
// verify the service is running and the process is healthy.
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
// Module routers will be mounted here as features are built.
//
// Example:
// import authRoutes from '../modules/auth/auth.routes';
// import patientRoutes from '../modules/patients/patient.routes';
//
// router.use('/auth', authRoutes);
// router.use('/patients', patientRoutes);
// ---------------------------------------------------------------------------

export default router;
