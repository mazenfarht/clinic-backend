// src/modules/patients/patient.controller.ts

import type { Request, Response } from "express";
import * as PatientService from "./patient.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../shared/errors/AppError";
import {
  createPatientSchema,
  updatePatientSchema,
  patientQuerySchema,
  patientIdSchema,
} from "./patient.validation";

// ---------------------------------------------------------------------------
// Resolve authenticated clinic and user from token
// ---------------------------------------------------------------------------

function resolveAuth(req: Request): { clinicId: string; userId: string } {
  if (!req.user) {
    throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  }
  return { clinicId: req.user.clinicId, userId: req.user.sub };
}

// ---------------------------------------------------------------------------
// POST /patients
// ---------------------------------------------------------------------------

export const createPatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const input = createPatientSchema.parse(req.body);
    const patient = await PatientService.createPatient(clinicId, userId, input);

    ApiResponse.created(res, patient, "Patient created successfully");
  }
);

// ---------------------------------------------------------------------------
// GET /patients
// ---------------------------------------------------------------------------

export const listPatients = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const filters = patientQuerySchema.parse(req.query);
    const result = await PatientService.listPatients(clinicId, filters);

    ApiResponse.paginated(
      res,
      result.patients,
      result.meta,
      "Patients retrieved successfully"
    );
  }
);

// ---------------------------------------------------------------------------
// GET /patients/:id
// ---------------------------------------------------------------------------

export const getPatientById = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { id } = patientIdSchema.parse(req.params);
    const patient = await PatientService.getPatientById(id, clinicId);

    ApiResponse.ok(res, patient, "Patient retrieved successfully");
  }
);

// ---------------------------------------------------------------------------
// PATCH /patients/:id
// ---------------------------------------------------------------------------

export const updatePatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = patientIdSchema.parse(req.params);
    const input = updatePatientSchema.parse(req.body);
    const patient = await PatientService.updatePatient(
      id,
      clinicId,
      userId,
      input
    );

    ApiResponse.ok(res, patient, "Patient updated successfully");
  }
);

// ---------------------------------------------------------------------------
// DELETE /patients/:id
// ---------------------------------------------------------------------------

export const deletePatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = patientIdSchema.parse(req.params);
    await PatientService.softDeletePatient(id, clinicId, userId);

    ApiResponse.ok(res, null, "Patient deleted successfully");
  }
);

// ---------------------------------------------------------------------------
// PATCH /patients/:id/restore
// ---------------------------------------------------------------------------

export const restorePatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = patientIdSchema.parse(req.params);
    const patient = await PatientService.restorePatient(id, clinicId, userId);

    ApiResponse.ok(res, patient, "Patient restored successfully");
  }
);
