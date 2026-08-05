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
} from "./queue.validation";
import { z } from "zod";

function resolveAuth(req: Request): { clinicId: string; userId: string } {
  if (!req.user) {
    throw new AppError("Unauthenticated", HttpStatus.UNAUTHORIZED);
  }
  return { clinicId: req.user.clinicId, userId: req.user.sub };
}

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const input = checkInSchema.parse(req.body);
  const entry = await QueueService.checkIn(clinicId, userId, input);
  ApiResponse.created(res, entry, "Patient checked in successfully");
});

export const reserveSlot = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const input = reserveSlotSchema.parse(req.body);
  const entry = await QueueService.reserveSlot(clinicId, userId, input);
  ApiResponse.created(res, entry, "Queue slot reserved successfully");
});

export const getQueue = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = resolveAuth(req);
  const filters = queueQuerySchema.parse(req.query);
  const result = await QueueService.getQueue(clinicId, filters);
  ApiResponse.paginated(
    res,
    result.entries,
    result.meta,
    "Queue retrieved successfully"
  );
});

export const getQueueStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const status = await QueueService.getQueueStatus(clinicId);
    ApiResponse.ok(res, status, "Queue status retrieved successfully");
  }
);

export const getQueueStatistics = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { date } = z
      .object({
        date: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
          .optional(),
      })
      .parse(req.query);
    const statistics = await QueueService.getQueueStatistics(clinicId, date);
    ApiResponse.ok(res, statistics, "Queue statistics retrieved successfully");
  }
);

export const getQueueEntryById = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId } = resolveAuth(req);
    const { id } = queueEntryIdSchema.parse(req.params);
    const entry = await QueueService.getQueueEntryById(id, clinicId);
    ApiResponse.ok(res, entry, "Queue entry retrieved successfully");
  }
);

export const callNext = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const entry = await QueueService.callNext(clinicId, userId);
  ApiResponse.ok(res, entry, "Next patient called successfully");
});

export const markServed = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const { id } = queueEntryIdSchema.parse(req.params);
  const entry = await QueueService.markServed(id, clinicId, userId);
  ApiResponse.ok(res, entry, "Patient marked as served successfully");
});

export const skipPatient = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const { id } = queueEntryIdSchema.parse(req.params);
  const entry = await QueueService.skipPatient(id, clinicId, userId);
  ApiResponse.ok(res, entry, "Patient skipped successfully");
});

export const recallPatient = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = queueEntryIdSchema.parse(req.params);
    const entry = await QueueService.recallPatient(id, clinicId, userId);
    ApiResponse.ok(res, entry, "Patient recalled successfully");
  }
);

export const startConsultation = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = queueEntryIdSchema.parse(req.params);
    const entry = await QueueService.startConsultation(id, clinicId, userId);
    ApiResponse.ok(res, entry, "Consultation started successfully");
  }
);

export const cancelQueueEntry = asyncHandler(
  async (req: Request, res: Response) => {
    const { clinicId, userId } = resolveAuth(req);
    const { id } = queueEntryIdSchema.parse(req.params);
    const entry = await QueueService.cancelQueueEntry(id, clinicId, userId);
    ApiResponse.ok(res, entry, "Queue entry cancelled successfully");
  }
);

export const resetQueue = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = resolveAuth(req);
  const result = await QueueService.resetQueue(clinicId, userId);
  ApiResponse.ok(
    res,
    result,
    `Queue reset successfully. ${result.cancelled} entries cancelled.`
  );
});
