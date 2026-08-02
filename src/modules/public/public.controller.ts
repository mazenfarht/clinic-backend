// src/modules/public/public.controller.ts

import type { Request, Response } from "express";
import * as PublicService from "./public.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import {
  clinicIdParamSchema,
  availabilityQuerySchema,
  patientLookupSchema,
  publicRegisterPatientSchema,
  publicBookAppointmentSchema,
} from "./public.validation";

// ---------------------------------------------------------------------------
// GET /public/clinics/:clinicId/availability
// ---------------------------------------------------------------------------

export const getAvailability = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = clinicIdParamSchema.parse(req.params);
    const { date } = availabilityQuerySchema.parse(req.query);

    const result = await PublicService.getAvailability(clinicId, date);

    ApiResponse.ok(res, result, "Availability retrieved successfully");
  }
);

// ---------------------------------------------------------------------------
// POST /public/clinics/:clinicId/patients/lookup
// ---------------------------------------------------------------------------

export const lookupPatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = clinicIdParamSchema.parse(req.params);
    const { phone } = patientLookupSchema.parse(req.body);

    const result = await PublicService.lookupPatientByPhone(clinicId, phone);

    ApiResponse.ok(res, result, "Patient lookup completed");
  }
);

// ---------------------------------------------------------------------------
// POST /public/clinics/:clinicId/patients/register
// ---------------------------------------------------------------------------

export const registerPatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = clinicIdParamSchema.parse(req.params);
    const input = publicRegisterPatientSchema.parse(req.body);

    const result = await PublicService.registerPatient(clinicId, input);

    ApiResponse.created(res, result, "Patient registered successfully");
  }
);

// ---------------------------------------------------------------------------
// POST /public/clinics/:clinicId/appointments
// ---------------------------------------------------------------------------

export const bookAppointment = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = clinicIdParamSchema.parse(req.params);
    const input = publicBookAppointmentSchema.parse(req.body);

    const result = await PublicService.bookAppointment(clinicId, input);

    ApiResponse.created(res, result, "Appointment booked successfully");
  }
);
