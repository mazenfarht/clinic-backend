// src/modules/admin/clinics/admin-clinics.controller.ts

import type { Request, Response } from "express";
import * as AdminClinicsService from "./admin-clinics.service";
import { ApiResponse } from "../../../shared/utils/apiResponse";
import asyncHandler from "../../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../../shared/errors/AppError";
import {
  createClinicSchema,
  listClinicsQuerySchema,
  updateClinicSchema,
  updateClinicStatusSchema,
  addDoctorSchema,
  clinicIdParamSchema,
  clinicUserParamSchema,
} from "./admin-clinics.validation";

function adminIdOf(req: Request): string {
  if (!req.admin) throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  return req.admin.id;
}

// Responses that contain a generated password must never be cached by the
// browser or a proxy.
function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
}

// POST /admin/clinics
export const createClinic = asyncHandler(
  async (req: Request, res: Response) => {
    const input = createClinicSchema.parse(req.body);
    const result = await AdminClinicsService.createClinic(input, adminIdOf(req));

    noStore(res);
    ApiResponse.created(
      res,
      result,
      "Clinic created. The temporary password is shown only once."
    );
  }
);

// GET /admin/clinics
export const listClinics = asyncHandler(async (req: Request, res: Response) => {
  const query = listClinicsQuerySchema.parse(req.query);
  const result = await AdminClinicsService.listClinics(query);

  ApiResponse.paginated(
    res,
    result.clinics,
    result.meta,
    "Clinics retrieved successfully"
  );
});

// GET /admin/clinics/:id
export const getClinic = asyncHandler(async (req: Request, res: Response) => {
  const { id } = clinicIdParamSchema.parse(req.params);
  const clinic = await AdminClinicsService.getClinic(id);

  ApiResponse.ok(res, clinic, "Clinic retrieved successfully");
});

// PATCH /admin/clinics/:id
export const updateClinic = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = clinicIdParamSchema.parse(req.params);
    const input = updateClinicSchema.parse(req.body);
    const clinic = await AdminClinicsService.updateClinic(
      id,
      input,
      adminIdOf(req)
    );

    ApiResponse.ok(res, clinic, "Clinic updated successfully");
  }
);

// PATCH /admin/clinics/:id/status
export const setClinicStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = clinicIdParamSchema.parse(req.params);
    const { isActive } = updateClinicStatusSchema.parse(req.body);
    const clinic = await AdminClinicsService.setClinicStatus(
      id,
      isActive,
      adminIdOf(req)
    );

    ApiResponse.ok(
      res,
      clinic,
      isActive ? "Clinic activated" : "Clinic suspended"
    );
  }
);

// POST /admin/clinics/:id/doctors
export const addDoctor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = clinicIdParamSchema.parse(req.params);
  const input = addDoctorSchema.parse(req.body);
  const result = await AdminClinicsService.addDoctor(id, input, adminIdOf(req));

  noStore(res);
  ApiResponse.created(
    res,
    result,
    "Doctor created. The temporary password is shown only once."
  );
});

// POST /admin/clinics/:id/users/:userId/reset-password
export const resetUserPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { id, userId } = clinicUserParamSchema.parse(req.params);
    const result = await AdminClinicsService.resetUserPassword(
      id,
      userId,
      adminIdOf(req)
    );

    noStore(res);
    ApiResponse.ok(
      res,
      result,
      "Password reset. The temporary password is shown only once."
    );
  }
);
