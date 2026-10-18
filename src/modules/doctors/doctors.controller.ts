// src/modules/doctors/doctors.controller.ts

import type { Request, Response } from "express";
import * as DoctorsService from "./doctors.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../shared/errors/AppError";
import {
  createDoctorSchema,
  updateDoctorSchema,
  doctorIdSchema,
} from "./doctors.validation";

function clinicIdOf(req: Request): string {
  if (!req.user) throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  return req.user.clinicId;
}

export const listDoctors = asyncHandler(async (req: Request, res: Response) => {
  const doctors = await DoctorsService.listDoctors(clinicIdOf(req));
  ApiResponse.ok(res, doctors, "Doctors retrieved successfully");
});

export const createDoctor = asyncHandler(
  async (req: Request, res: Response) => {
    const input = createDoctorSchema.parse(req.body);
    const doctor = await DoctorsService.createDoctor(clinicIdOf(req), input);
    ApiResponse.created(res, doctor, "Doctor created successfully");
  }
);

export const updateDoctor = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = doctorIdSchema.parse(req.params);
    const input = updateDoctorSchema.parse(req.body);
    const doctor = await DoctorsService.updateDoctor(
      id,
      clinicIdOf(req),
      input
    );
    ApiResponse.ok(res, doctor, "Doctor updated successfully");
  }
);
