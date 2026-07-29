// src/modules/visits/visit.controller.ts

import type { Request, Response } from "express";
import * as VisitService from "./visit.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../shared/errors/AppError";
import {
  createVisitSchema,
  updateVisitSchema,
  visitQuerySchema,
  visitIdSchema,
  patientIdParamSchema,
} from "./visit.validation";

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
// POST /visits
// ---------------------------------------------------------------------------

export const createVisit = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const input = createVisitSchema.parse(req.body);
  const visit = await VisitService.createVisit(clinicId, userId, input);

  ApiResponse.created(res, visit, "Visit created successfully");
});

// ---------------------------------------------------------------------------
// GET /visits
// ---------------------------------------------------------------------------

export const listVisits = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = resolveAuth(req);
  const filters = visitQuerySchema.parse(req.query);
  const result = await VisitService.listVisits(clinicId, filters);

  ApiResponse.paginated(
    res,
    result.visits,
    result.meta,
    "Visits retrieved successfully"
  );
});

// ---------------------------------------------------------------------------
// GET /visits/:id
// ---------------------------------------------------------------------------

export const getVisitById = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { id } = visitIdSchema.parse(req.params);
    const visit = await VisitService.getVisitById(id, clinicId);

    ApiResponse.ok(res, visit, "Visit retrieved successfully");
  }
);

// ---------------------------------------------------------------------------
// GET /patients/:patientId/visits
// ---------------------------------------------------------------------------

export const listVisitsByPatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { patientId } = patientIdParamSchema.parse(req.params);
    const filters = visitQuerySchema.parse(req.query);
    const result = await VisitService.listVisitsByPatient(
      patientId,
      clinicId,
      filters
    );

    ApiResponse.paginated(
      res,
      result.visits,
      result.meta,
      "Patient visits retrieved successfully"
    );
  }
);

// ---------------------------------------------------------------------------
// PATCH /visits/:id
// ---------------------------------------------------------------------------

export const updateVisit = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const { id } = visitIdSchema.parse(req.params);
  const input = updateVisitSchema.parse(req.body);
  const visit = await VisitService.updateVisit(id, clinicId, userId, input);

  ApiResponse.ok(res, visit, "Visit updated successfully");
});

// ---------------------------------------------------------------------------
// DELETE /visits/:id
// ---------------------------------------------------------------------------

export const deleteVisit = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = resolveAuth(req);
  const { id } = visitIdSchema.parse(req.params);
  await VisitService.deleteVisit(id, clinicId);

  ApiResponse.ok(res, null, "Visit deleted successfully");
});
