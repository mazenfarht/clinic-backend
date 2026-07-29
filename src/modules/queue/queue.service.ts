// src/modules/queue/queue.service.ts

import prisma from "../../config/database";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../shared/errors/AppError";
import { ApiResponse } from "../../shared/utils/apiResponse";
import { QUEUE_STATUS_TRANSITIONS } from "./queue.types";
import type {
  QueueEntrySummary,
  QueueEntryFilters,
  QueueListResult,
  QueueStatistics,
  QueueStatus_Current,
} from "./queue.types";
import type { CheckInInput, ReserveSlotInput } from "./queue.validation";
import type { QueueStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared select
// ---------------------------------------------------------------------------

const queueEntrySummarySelect = {
  id: true,
  clinicId: true,
  visitId: true,
  queueDate: true,
  queueNumber: true,
  isReserved: true,
  reservedFor: true,
  status: true,
  calledAt: true,
  servedAt: true,
  createdAt: true,
  updatedAt: true,
  visit: {
    select: {
      id: true,
      visitDate: true,
      chiefComplaint: true,
      patient: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          mrn: true,
        },
      },
    },
  },
  createdBy: {
    select: {
      id: true,
      fullName: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      fullName: true,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayDate(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function parseDateFilter(date?: string): Date {
  if (!date) return getTodayDate();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (isNaN(parsed.getTime())) throw new BadRequestError("Invalid date format");
  return parsed;
}

function assertStatusTransition(
  current: QueueStatus,
  target: QueueStatus
): void {
  const allowed = QUEUE_STATUS_TRANSITIONS[current];
  if (!allowed.includes(target)) {
    throw new BadRequestError(
      `Cannot transition queue entry from "${current}" to "${target}"`
    );
  }
}

async function findEntryOrThrow(
  id: string,
  clinicId: string
): Promise<{ id: string; status: QueueStatus; visitId: string | null }> {
  const entry = await prisma.queueEntry.findFirst({
    where: { id, clinicId },
    select: { id: true, status: true, visitId: true },
  });

  if (!entry) {
    throw new NotFoundError("Queue entry not found");
  }

  return entry;
}

async function generateQueueNumber(
  clinicId: string,
  queueDate: Date
): Promise<number> {
  const lastEntry = await prisma.queueEntry.findFirst({
    where: { clinicId, queueDate },
    orderBy: { queueNumber: "desc" },
    select: { queueNumber: true },
  });

  const lastNumber = lastEntry?.queueNumber ?? 0;
  return lastNumber + 1;
}

async function assertNoActiveQueueEntry(
  clinicId: string,
  patientId: string,
  queueDate: Date
): Promise<void> {
  const existing = await prisma.queueEntry.findFirst({
    where: {
      clinicId,
      queueDate,
      status: { in: ["WAITING", "IN_PROGRESS"] },
      visit: { patientId },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(
      "Patient already has an active queue entry for today"
    );
  }
}

// ---------------------------------------------------------------------------
// Check in patient
// ---------------------------------------------------------------------------

export async function checkIn(
  clinicId: string,
  createdById: string,
  input: CheckInInput
): Promise<QueueEntrySummary> {
  const queueDate = getTodayDate();

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, clinicId, deletedAt: null },
    select: { id: true },
  });

  if (!patient) {
    throw new NotFoundError("Patient not found or has been deleted");
  }

  await assertNoActiveQueueEntry(clinicId, input.patientId, queueDate);

  if (input.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        clinicId,
        patientId: input.patientId,
        status: "SCHEDULED",
      },
      select: { id: true, visitId: true },
    });

    if (!appointment) {
      throw new NotFoundError(
        "Appointment not found, does not belong to this patient, or is not scheduled"
      );
    }

    if (appointment.visitId) {
      throw new ConflictError("Appointment already has a visit linked to it");
    }
  }

  const entry = await prisma.$transaction(async (tx) => {
    const visit = await tx.visit.create({
      data: {
        clinicId,
        patientId: input.patientId,
        createdById,
        updatedById: createdById,
        visitDate: queueDate,
        chiefComplaint: input.chiefComplaint ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });

    if (input.appointmentId) {
      await tx.appointment.update({
        where: { id: input.appointmentId },
        data: {
          visitId: visit.id,
          updatedById: createdById,
        },
      });
    }

    const queueNumber = await generateQueueNumber(clinicId, queueDate);

    const queueEntry = await tx.queueEntry.create({
      data: {
        clinicId,
        visitId: visit.id,
        createdById,
        updatedById: createdById,
        queueDate,
        queueNumber,
        isReserved: false,
        status: "WAITING",
      },
      select: queueEntrySummarySelect,
    });

    return queueEntry;
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Reserve slot
// ---------------------------------------------------------------------------

export async function reserveSlot(
  clinicId: string,
  createdById: string,
  input: ReserveSlotInput
): Promise<QueueEntrySummary> {
  const queueDate = getTodayDate();

  const existing = await prisma.queueEntry.findFirst({
    where: { clinicId, queueDate, queueNumber: input.queueNumber },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(
      `Queue number ${input.queueNumber} is already taken for today`
    );
  }

  const entry = await prisma.queueEntry.create({
    data: {
      clinicId,
      createdById,
      updatedById: createdById,
      queueDate,
      queueNumber: input.queueNumber,
      isReserved: true,
      reservedFor: input.reservedFor,
      status: "WAITING",
    },
    select: queueEntrySummarySelect,
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Get today's queue
// ---------------------------------------------------------------------------

export async function getQueue(
  clinicId: string,
  filters: QueueEntryFilters
): Promise<QueueListResult> {
  const { status, date, page = 1, limit = 20 } = filters;

  const queueDate = parseDateFilter(date);
  const skip = (page - 1) * limit;

  const where = {
    clinicId,
    queueDate,
    ...(status ? { status } : {}),
  };

  const [total, entries] = await prisma.$transaction([
    prisma.queueEntry.count({ where }),
    prisma.queueEntry.findMany({
      where,
      select: queueEntrySummarySelect,
      orderBy: { queueNumber: "asc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    entries: entries as QueueEntrySummary[],
    meta: ApiResponse.buildPaginationMeta(total, page, limit),
  };
}

// ---------------------------------------------------------------------------
// Get queue entry by ID
// ---------------------------------------------------------------------------

export async function getQueueEntryById(
  id: string,
  clinicId: string
): Promise<QueueEntrySummary> {
  await findEntryOrThrow(id, clinicId);

  const entry = await prisma.queueEntry.findFirst({
    where: { id, clinicId },
    select: queueEntrySummarySelect,
  });

  if (!entry) throw new NotFoundError("Queue entry not found");

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Call next patient
// ---------------------------------------------------------------------------

export async function callNext(
  clinicId: string,
  updatedById: string
): Promise<QueueEntrySummary> {
  const queueDate = getTodayDate();

  const inProgress = await prisma.queueEntry.findFirst({
    where: { clinicId, queueDate, status: "IN_PROGRESS" },
    select: { id: true, queueNumber: true },
  });

  if (inProgress) {
    throw new ConflictError(
      `Patient #${inProgress.queueNumber} is currently being served. Please complete or cancel before calling next.`
    );
  }

  const next = await prisma.queueEntry.findFirst({
    where: { clinicId, queueDate, status: "WAITING" },
    orderBy: { queueNumber: "asc" },
    select: { id: true },
  });

  if (!next) {
    throw new NotFoundError("No waiting patients in the queue");
  }

  const entry = await prisma.queueEntry.update({
    where: { id: next.id },
    data: {
      status: "IN_PROGRESS",
      calledAt: new Date(),
      updatedById,
    },
    select: queueEntrySummarySelect,
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Mark as served
// ---------------------------------------------------------------------------

export async function markServed(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<QueueEntrySummary> {
  const existing = await findEntryOrThrow(id, clinicId);

  assertStatusTransition(existing.status, "SERVED");

  const entry = await prisma.queueEntry.update({
    where: { id },
    data: {
      status: "SERVED",
      servedAt: new Date(),
      updatedById,
    },
    select: queueEntrySummarySelect,
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Skip patient (send back to waiting)
// ---------------------------------------------------------------------------

export async function skipPatient(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<QueueEntrySummary> {
  const existing = await findEntryOrThrow(id, clinicId);

  assertStatusTransition(existing.status, "WAITING");

  const entry = await prisma.queueEntry.update({
    where: { id },
    data: {
      status: "WAITING",
      calledAt: null,
      updatedById,
    },
    select: queueEntrySummarySelect,
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Recall skipped patient
// ---------------------------------------------------------------------------

export async function recallPatient(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<QueueEntrySummary> {
  const existing = await findEntryOrThrow(id, clinicId);

  if (existing.status !== "WAITING") {
    throw new BadRequestError("Only waiting patients can be recalled");
  }

  const inProgress = await prisma.queueEntry.findFirst({
    where: {
      clinicId,
      queueDate: getTodayDate(),
      status: "IN_PROGRESS",
    },
    select: { id: true, queueNumber: true },
  });

  if (inProgress) {
    throw new ConflictError(
      `Patient #${inProgress.queueNumber} is currently being served. Please complete or cancel before recalling.`
    );
  }

  const entry = await prisma.queueEntry.update({
    where: { id },
    data: {
      status: "IN_PROGRESS",
      calledAt: new Date(),
      updatedById,
    },
    select: queueEntrySummarySelect,
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Cancel queue entry
// ---------------------------------------------------------------------------

export async function cancelQueueEntry(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<QueueEntrySummary> {
  const existing = await findEntryOrThrow(id, clinicId);

  assertStatusTransition(existing.status, "CANCELLED");

  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.queueEntry.update({
      where: { id },
      data: {
        status: "CANCELLED",
        updatedById,
      },
      select: queueEntrySummarySelect,
    });

    if (existing.visitId) {
      await tx.appointment.updateMany({
        where: {
          visitId: existing.visitId,
          clinicId,
          status: "SCHEDULED",
        },
        data: {
          visitId: null,
          updatedById,
        },
      });
    }

    return updated;
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Get current queue status
// ---------------------------------------------------------------------------

export async function getQueueStatus(
  clinicId: string
): Promise<QueueStatus_Current> {
  const queueDate = getTodayDate();

  const [currentlyServing, nextWaiting, waitingCount, servedCount] =
    await prisma.$transaction([
      prisma.queueEntry.findFirst({
        where: { clinicId, queueDate, status: "IN_PROGRESS" },
        select: queueEntrySummarySelect,
        orderBy: { calledAt: "desc" },
      }),
      prisma.queueEntry.findFirst({
        where: { clinicId, queueDate, status: "WAITING" },
        select: queueEntrySummarySelect,
        orderBy: { queueNumber: "asc" },
      }),
      prisma.queueEntry.count({
        where: { clinicId, queueDate, status: "WAITING" },
      }),
      prisma.queueEntry.count({
        where: { clinicId, queueDate, status: "SERVED" },
      }),
    ]);

  return {
    currentlyServing: currentlyServing as QueueEntrySummary | null,
    nextWaiting: nextWaiting as QueueEntrySummary | null,
    waitingCount,
    servedCount,
  };
}

// ---------------------------------------------------------------------------
// Get queue statistics
// ---------------------------------------------------------------------------

export async function getQueueStatistics(
  clinicId: string,
  date?: string
): Promise<QueueStatistics> {
  const queueDate = parseDateFilter(date);

  const [total, waiting, inProgress, served, cancelled, servedEntries] =
    await prisma.$transaction([
      prisma.queueEntry.count({ where: { clinicId, queueDate } }),
      prisma.queueEntry.count({
        where: { clinicId, queueDate, status: "WAITING" },
      }),
      prisma.queueEntry.count({
        where: { clinicId, queueDate, status: "IN_PROGRESS" },
      }),
      prisma.queueEntry.count({
        where: { clinicId, queueDate, status: "SERVED" },
      }),
      prisma.queueEntry.count({
        where: { clinicId, queueDate, status: "CANCELLED" },
      }),
      prisma.queueEntry.findMany({
        where: {
          clinicId,
          queueDate,
          status: "SERVED",
          calledAt: { not: null },
          servedAt: { not: null },
        },
        select: {
          createdAt: true,
          calledAt: true,
          servedAt: true,
        },
      }),
    ]);

  let averageWaitTimeMinutes: number | null = null;
  let averageServeTimeMinutes: number | null = null;

  if (servedEntries.length > 0) {
    const waitTimes = servedEntries
      .filter((e) => e.calledAt !== null)
      .map((e) => (e.calledAt!.getTime() - e.createdAt.getTime()) / 1000 / 60);

    const serveTimes = servedEntries
      .filter((e) => e.calledAt !== null && e.servedAt !== null)
      .map((e) => (e.servedAt!.getTime() - e.calledAt!.getTime()) / 1000 / 60);

    if (waitTimes.length > 0) {
      averageWaitTimeMinutes = parseFloat(
        (waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length).toFixed(1)
      );
    }

    if (serveTimes.length > 0) {
      averageServeTimeMinutes = parseFloat(
        (serveTimes.reduce((a, b) => a + b, 0) / serveTimes.length).toFixed(1)
      );
    }
  }

  return {
    date: queueDate.toISOString().split("T")[0],
    total,
    waiting,
    inProgress,
    served,
    cancelled,
    averageWaitTimeMinutes,
    averageServeTimeMinutes,
  };
}

// ---------------------------------------------------------------------------
// Reset today's queue
// ---------------------------------------------------------------------------

export async function resetQueue(
  clinicId: string,
  updatedById: string
): Promise<{ cancelled: number }> {
  const queueDate = getTodayDate();

  const result = await prisma.queueEntry.updateMany({
    where: {
      clinicId,
      queueDate,
      status: { in: ["WAITING", "IN_PROGRESS"] },
    },
    data: {
      status: "CANCELLED",
      updatedById,
    },
  });

  return { cancelled: result.count };
}
