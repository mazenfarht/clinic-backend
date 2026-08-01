// src/modules/clinic-settings/clinic-settings.controller.ts

import type { Request, Response } from "express";
import * as ClinicSettingsService from "./clinic-settings.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../shared/errors/AppError";
import { updateClinicSettingsSchema } from "./clinic-settings.validation";

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
// GET /clinic-settings
// ---------------------------------------------------------------------------

export const getClinicSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const settings = await ClinicSettingsService.getClinicSettings(clinicId);

    ApiResponse.ok(res, settings, "Clinic settings retrieved successfully");
  }
);

// ---------------------------------------------------------------------------
// PATCH /clinic-settings
// ---------------------------------------------------------------------------

export const updateClinicSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const input = updateClinicSettingsSchema.parse(req.body);
    const settings = await ClinicSettingsService.updateClinicSettings(
      clinicId,
      input
    );

    ApiResponse.ok(res, settings, "Clinic settings updated successfully");
  }
);
