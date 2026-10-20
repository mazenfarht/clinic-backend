// src/modules/queue/queue.controller.ts

import type { Request, Response } from "express";
import * as QueueService from "./queue.service";
import { ApiResponse } from "../../shared/utils/apiResponse";
import asyncHandler from "../../shared/utils/asyncHandler";
import { AppError, HttpStatus } from "../../shared/errors/AppError";
import {
  checkInSchema,
  reserveSlotSchema,
  queueQuerySchema,
  queueEntryIdSchema,
  doctorScopeSchema,
  queueStatisticsQuerySchema,
} from "./queue.validation";
import {
  resolveDoctorId,
  assertQueueEntryAccess,
} from "../doctors/doctor-scope";

function resolveAuth(req: Request): { clinicId: string; userId: string } {
  if (!req.user) {
    throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  }
  return { clinicId: req.user.clinicId, userId: req.user.sub };
}

// ---------------------------------------------------------------------------
// Doctor scoping rules (see doctors/doctor-scope.ts):
//   DOCTOR       -> always their own queue
//   RECEPTIONIST -> any doctor's queue (pass doctorId), or all of them
// ---------------------------------------------------------------------------

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const input = checkInSchema.parse(req.body);
  const doctorId = await resolveDoctorId(req, input.doctorId);
  const entry = await QueueService.checkIn(clinicId, userId, input, doctorId);
  ApiResponse.created(res, entry, "Patient checked in successfully");
});

export const reserveSlot = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const input = reserveSlotSchema.parse(req.body);
  const doctorId = await resolveDoctorId(req, input.doctorId);
  const entry = await QueueService.reserveSlot(
    clinicId,
    userId,
    input,
    doctorId
  );
  ApiResponse.created(res, entry, "Queue slot reserved successfully");
});

export const getQueue = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = resolveAuth(req);
  const filters = queueQuerySchema.parse(req.query);
  const doctorId = await resolveDoctorId(req, filters.doctorId);
  const result = await QueueService.getQueue(clinicId, {
    ...filters,
    doctorId,
  });
  ApiResponse.paginated(
    res,
    result.entries,
    result.meta,
    "Queue retrieved successfully"
  );
});

// DOCTOR (or reception with ?doctorId=) -> one doctor's status object.
// Reception without doctorId -> an array with every doctor's status.
export const getQueueStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { doctorId: requested } = doctorScopeSchema.parse(req.query);
    const doctorId = await resolveDoctorId(req, requested);

    const status = doctorId
      ? await QueueService.getQueueStatus(clinicId, doctorId)
      : await QueueService.getAllDoctorsQueueStatus(clinicId);

    ApiResponse.ok(res, status, "Queue status retrieved successfully");
  }
);

export const getQueueStatistics = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { date, doctorId: requested } = queueStatisticsQuerySchema.parse(
      req.query
    );
    const doctorId = await resolveDoctorId(req, requested);
    const statistics = await QueueService.getQueueStatistics(
      clinicId,
      date,
      doctorId
    );
    ApiResponse.ok(res, statistics, "Queue statistics retrieved successfully");
  }
);

export const getQueueEntryById = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { id } = queueEntryIdSchema.parse(req.params);
    await assertQueueEntryAccess(req, id);
    const entry = await QueueService.getQueueEntryById(id, clinicId);
    ApiResponse.ok(res, entry, "Queue entry retrieved successfully");
  }
);

export const callNext = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const { doctorId: requested } = doctorScopeSchema.parse(req.body ?? {});
  const doctorId = await resolveDoctorId(req, requested);
  const entry = await QueueService.callNext(clinicId, userId, doctorId);
  ApiResponse.ok(res, entry, "Next patient called successfully");
});

export const markServed = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const { id } = queueEntryIdSchema.parse(req.params);
  await assertQueueEntryAccess(req, id);
  const entry = await QueueService.markServed(id, clinicId, userId);
  ApiResponse.ok(res, entry, "Patient marked as served successfully");
});

export const skipPatient = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const { id } = queueEntryIdSchema.parse(req.params);
  await assertQueueEntryAccess(req, id);
  const entry = await QueueService.skipPatient(id, clinicId, userId);
  ApiResponse.ok(res, entry, "Patient skipped successfully");
});

export const recallPatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = queueEntryIdSchema.parse(req.params);
    await assertQueueEntryAccess(req, id);
    const entry = await QueueService.recallPatient(id, clinicId, userId);
    ApiResponse.ok(res, entry, "Patient recalled successfully");
  }
);

export const startConsultation = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = queueEntryIdSchema.parse(req.params);
    await assertQueueEntryAccess(req, id);
    const entry = await QueueService.startConsultation(id, clinicId, userId);
    ApiResponse.ok(res, entry, "Consultation started successfully");
  }
);

export const cancelQueueEntry = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = queueEntryIdSchema.parse(req.params);
    await assertQueueEntryAccess(req, id);
    const entry = await QueueService.cancelQueueEntry(id, clinicId, userId);
    ApiResponse.ok(res, entry, "Queue entry cancelled successfully");
  }
);

export const resetQueue = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const { doctorId: requested } = doctorScopeSchema.parse(req.body ?? {});
  const doctorId = await resolveDoctorId(req, requested);
  const result = await QueueService.resetQueue(clinicId, userId, doctorId);
  ApiResponse.ok(
    res,
    result,
    `Queue reset successfully. ${result.cancelled} entries cancelled.`
  );
});
