// src/modules/dashboard/dashboard.controller.ts

import type { Request, Response } from "express";
import * as DashboardService from "./dashboard.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../shared/errors/AppError";
import {
  overviewQuerySchema,
  todayQuerySchema,
  queueDashboardQuerySchema,
  appointmentsDashboardQuerySchema,
  patientsDashboardQuerySchema,
  analyticsQuerySchema,
} from "./dashboard.validation";

// ---------------------------------------------------------------------------
// Resolve authenticated clinic from token
// ---------------------------------------------------------------------------

function resolveAuth(req: Request): { clinicId: string; userId: string } {
  if (!req.user) {
    throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  }
  return { clinicId: req.user.clinicId, userId: req.user.sub };
}

// ---------------------------------------------------------------------------
// GET /dashboard/overview
// ---------------------------------------------------------------------------

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = resolveAuth(req);
  const input = overviewQuerySchema.parse(req.query);
  const data = await DashboardService.getOverview(clinicId, input);
  console.log("Query:", req.query); // في الـ controller
  ApiResponse.ok(res, data, "Overview retrieved successfully");
});

// ---------------------------------------------------------------------------
// GET /dashboard/today
// ---------------------------------------------------------------------------

export const getToday = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = resolveAuth(req);
  const input = todayQuerySchema.parse(req.query);
  const data = await DashboardService.getToday(clinicId, input);

  ApiResponse.ok(res, data, "Today's dashboard retrieved successfully");
});

// ---------------------------------------------------------------------------
// GET /dashboard/queue
// ---------------------------------------------------------------------------

export const getQueueDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const input = queueDashboardQuerySchema.parse(req.query);
    const data = await DashboardService.getQueueDashboard(clinicId, input);

    ApiResponse.ok(res, data, "Queue dashboard retrieved successfully");
  }
);

// ---------------------------------------------------------------------------
// GET /dashboard/appointments
// ---------------------------------------------------------------------------

export const getAppointmentsDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const input = appointmentsDashboardQuerySchema.parse(req.query);
    const data = await DashboardService.getAppointmentsDashboard(
      clinicId,
      input
    );

    ApiResponse.ok(res, data, "Appointments dashboard retrieved successfully");
  }
);

// ---------------------------------------------------------------------------
// GET /dashboard/patients
// ---------------------------------------------------------------------------

export const getPatientsDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const input = patientsDashboardQuerySchema.parse(req.query);
    const data = await DashboardService.getPatientsDashboard(clinicId, input);

    ApiResponse.ok(res, data, "Patients dashboard retrieved successfully");
  }
);

// ---------------------------------------------------------------------------
// GET /dashboard/analytics
// ---------------------------------------------------------------------------

export const getAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const input = analyticsQuerySchema.parse(req.query);
    const data = await DashboardService.getAnalytics(clinicId, input);

    ApiResponse.ok(res, data, "Analytics retrieved successfully");
  }
);
