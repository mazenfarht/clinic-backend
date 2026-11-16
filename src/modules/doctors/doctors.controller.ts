// src/modules/doctors/doctors.controller.ts

import type { Request, Response } from "express";
import * as DoctorsService from "./doctors.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { AppError, ForbiddenError, HttpStatus } from "../../shared/errors/AppError";
import { getLockedDoctorId } from "./doctor-scope";
import {
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

export const updateDoctor = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = doctorIdSchema.parse(req.params);
    const input = updateDoctorSchema.parse(req.body);

    // A DOCTOR login may only edit their OWN profile. getLockedDoctorId
    // returns undefined for any other role (e.g. a platform admin acting via
    // a different route), in which case this check does not apply here.
    const lockedDoctorId = await getLockedDoctorId(req);
    if (lockedDoctorId && lockedDoctorId !== id) {
      throw new ForbiddenError("You can only update your own doctor profile");
    }

    const doctor = await DoctorsService.updateDoctor(
      id,
      clinicIdOf(req),
      input
    );
    ApiResponse.ok(res, doctor, "Doctor updated successfully");
  }
);
