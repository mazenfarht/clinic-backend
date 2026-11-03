// src/modules/queue/queue.service.ts

import prisma from "../../config/database";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../shared/errors/AppError";
import { ApiResponse } from "../../shared/utils/apiResponse";
import { maskName } from "../../shared/utils/maskName";
import { QUEUE_STATUS_TRANSITIONS } from "./queue.types";
import type {
  QueueEntrySummary,
  QueueEntryFilters,
  QueueListResult,
  QueueStatistics,
  QueueStatus_Current,
  DoctorQueueStatus,
  WaitingBoard,
  WaitingBoardEntry,
} from "./queue.types";
import type { CheckInInput, ReserveSlotInput } from "./queue.validation";
import type { QueueStatus, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared select — includes ALL timestamp fields
// ---------------------------------------------------------------------------

const queueEntrySummarySelect = {
  id: true,
  clinicId: true,
  visitId: true,
  doctorId: true,
  queueDate: true,
  queueNumber: true,
  isReserved: true,
  reservedFor: true,
  status: true,
  checkedInAt: true,
  calledAt: true,
  startedAt: true,
  servedAt: true,
  createdAt: true,
  updatedAt: true,
  doctor: {
    select: {
      id: true,
      specialty: true,
      user: { select: { fullName: true } },
    },
  },
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

  if (isNaN(parsed.getTime())) {
    throw new BadRequestError("Invalid date format");
  }

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
): Promise<{
  id: string;
  status: QueueStatus;
  visitId: string | null;
  doctorId: string | null;
  startedAt: Date | null;
}> {
  const entry = await prisma.queueEntry.findFirst({
    where: { id, clinicId },
    select: {
      id: true,
      status: true,
      visitId: true,
      doctorId: true,
      startedAt: true,
    },
  });

  if (!entry) {
    throw new NotFoundError("Queue entry not found");
  }

  return entry;
}

// Queue numbers restart at 1 for every doctor, every day.
async function generateQueueNumber(
  tx: Prisma.TransactionClient,
  doctorId: string,
  queueDate: Date
): Promise<number> {
  const lastEntry = await tx.queueEntry.findFirst({
    where: { doctorId, queueDate },
    orderBy: { queueNumber: "desc" },
    select: { queueNumber: true },
  });

  const lastNumber = lastEntry?.queueNumber ?? 0;

  return lastNumber + 1;
}

// The doctor must belong to this clinic and have an active login account.
async function assertDoctorActive(
  doctorId: string,
  clinicId: string
): Promise<void> {
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId, user: { isActive: true } },
    select: { id: true },
  });

  if (!doctor) {
    throw new NotFoundError("Doctor not found or inactive");
  }
}

function requireDoctor(doctorId: string | undefined): string {
  if (!doctorId) {
    throw new BadRequestError("doctorId is required");
  }
  return doctorId;
}

// ---------------------------------------------------------------------------
// Queue priority helpers
// ---------------------------------------------------------------------------

function getTimeOfDay(date: Date): number {
  return (
    date.getUTCHours() * 60 * 60 * 1000 +
    date.getUTCMinutes() * 60 * 1000 +
    date.getUTCSeconds() * 1000 +
    date.getUTCMilliseconds()
  );
}

function getAppointmentTimeOfDay(date: Date): number {
  return (
    date.getUTCHours() * 60 * 60 * 1000 +
    date.getUTCMinutes() * 60 * 1000 +
    date.getUTCSeconds() * 1000 +
    date.getUTCMilliseconds()
  );
}

type QueuePriorityEntry = {
  id: string;
  queueNumber: number;
  checkedInAt: Date | null;
  appointmentTime: Date | null;
};

// A checked-in entry that is guaranteed to have both timestamps.
type CheckedInEntry = QueuePriorityEntry & {
  checkedInAt: Date;
  appointmentTime: Date;
};

type QueueCandidate = QueuePriorityEntry & {
  effectiveTime: number;
  isLate: boolean;
};

/**
 * Selects the next WAITING patient according to the clinic queue rule.
 *
 * Rules:
 *
 * 1. Patients are naturally ordered by appointment time.
 *
 * 2. A patient is LATE when:
 *      checkedInAt > appointmentTime
 *
 * 3. A late patient must wait for up to 3 patients whose appointment
 *    times are later than theirs AND who have already checked in.
 *
 * 4. A later patient counts immediately when checkedInAt is not null.
 *    Their current status is irrelevant:
 *
 *      WAITING     -> counts
 *      IN_PROGRESS -> counts
 *      SERVED      -> counts
 *
 * 5. If only 1 or 2 later patients have checked in, the late patient
 *    waits for only those 1 or 2.
 *
 * 6. If 3 or more later patients have checked in, the late patient
 *    waits for the first 3 by appointment time.
 *
 * 7. Patients who have not checked in NEVER count toward the 3.
 *
 * 8. calledAt / startedAt / servedAt are intentionally NOT used.
 */
async function selectNextWaiting(
  client: Prisma.TransactionClient | typeof prisma,
  clinicId: string,
  doctorId: string,
  queueDate: Date
): Promise<string | null> {
  // -------------------------------------------------------------------------
  // Fetch all WAITING candidates.
  //
  // Only WAITING entries can actually be called next.
  // -------------------------------------------------------------------------

  const waitingEntries = await client.queueEntry.findMany({
    where: {
      clinicId,
      doctorId,
      queueDate,
      status: "WAITING",
    },
    select: {
      id: true,
      queueNumber: true,
      checkedInAt: true,
      visit: {
        select: {
          appointment: {
            select: {
              appointmentTime: true,
            },
          },
        },
      },
    },
  });

  if (waitingEntries.length === 0) {
    return null;
  }

  // -------------------------------------------------------------------------
  // Fetch ALL today's checked-in patients.
  //
  // IMPORTANT:
  // Status is deliberately NOT filtered.
  //
  // A patient counts toward the "3" immediately after check-in.
  // It doesn't matter if they are:
  //
  // WAITING
  // IN_PROGRESS
  // SERVED
  //
  // calledAt / startedAt / servedAt are intentionally ignored.
  // -------------------------------------------------------------------------

  const checkedInEntries = await client.queueEntry.findMany({
    where: {
      clinicId,
      doctorId,
      queueDate,
      checkedInAt: {
        not: null,
      },
    },
    select: {
      id: true,
      queueNumber: true,
      checkedInAt: true,
      visit: {
        select: {
          appointment: {
            select: {
              appointmentTime: true,
            },
          },
        },
      },
    },
  });

  // -------------------------------------------------------------------------
  // Normalize appointment data.
  // -------------------------------------------------------------------------

  const allCheckedIn: CheckedInEntry[] = checkedInEntries
    .map((entry) => ({
      id: entry.id,
      queueNumber: entry.queueNumber,
      checkedInAt: entry.checkedInAt,
      appointmentTime: entry.visit?.appointment?.appointmentTime ?? null,
    }))
    .filter(
      (entry): entry is CheckedInEntry =>
        entry.checkedInAt !== null && entry.appointmentTime !== null
    );

  // -------------------------------------------------------------------------
  // Build effective position for every WAITING candidate.
  // -------------------------------------------------------------------------

  const candidates: QueueCandidate[] = waitingEntries.map((entry) => {
    const appointmentTime = entry.visit?.appointment?.appointmentTime ?? null;

    // -----------------------------------------------------------------------
    // Safety fallback for data that has no appointment.
    //
    // The requested queue rule is appointment-based.
    // If malformed / unexpected data has no appointment, put it last.
    // -----------------------------------------------------------------------

    if (!appointmentTime) {
      return {
        id: entry.id,
        queueNumber: entry.queueNumber,
        checkedInAt: entry.checkedInAt,
        appointmentTime: null,
        effectiveTime: Number.MAX_SAFE_INTEGER,
        isLate: false,
      };
    }

    // -----------------------------------------------------------------------
    // Reserved / unchecked-in entries.
    //
    // They have no checkedInAt, so they are NOT late.
    // They remain in normal appointment order.
    // -----------------------------------------------------------------------

    if (!entry.checkedInAt) {
      return {
        id: entry.id,
        queueNumber: entry.queueNumber,
        checkedInAt: null,
        appointmentTime,
        effectiveTime: getAppointmentTimeOfDay(appointmentTime),
        isLate: false,
      };
    }

    const checkedInTime = getTimeOfDay(entry.checkedInAt);
    const appointmentTimeValue = getAppointmentTimeOfDay(appointmentTime);

    const isLate = checkedInTime > appointmentTimeValue;

    // -----------------------------------------------------------------------
    // On-time patient.
    //
    // Normal appointment ordering.
    // -----------------------------------------------------------------------

    if (!isLate) {
      return {
        id: entry.id,
        queueNumber: entry.queueNumber,
        checkedInAt: entry.checkedInAt,
        appointmentTime,
        effectiveTime: appointmentTimeValue,
        isLate: false,
      };
    }

    // -----------------------------------------------------------------------
    // LATE PATIENT
    //
    // Find later appointment patients who have already checked in.
    //
    // IMPORTANT:
    // We DO NOT check their status.
    //
    // The only condition is:
    //
    // appointmentTime > late patient's appointmentTime
    // AND
    // checkedInAt IS NOT NULL
    // -----------------------------------------------------------------------

    const laterCheckedIn = allCheckedIn
      .filter((other) => {
        if (other.id === entry.id) {
          return false;
        }

        if (!other.appointmentTime) {
          return false;
        }

        return (
          getAppointmentTimeOfDay(other.appointmentTime) > appointmentTimeValue
        );
      })
      .sort((a, b) => {
        const timeA = getAppointmentTimeOfDay(a.appointmentTime);
        const timeB = getAppointmentTimeOfDay(b.appointmentTime);

        if (timeA !== timeB) {
          return timeA - timeB;
        }

        return a.queueNumber - b.queueNumber;
      });

    // -----------------------------------------------------------------------
    // Wait for up to 3 later checked-in patients.
    //
    // 0 later patients  -> enters immediately
    // 1 later patient   -> waits for 1
    // 2 later patients  -> waits for 2
    // 3+ later patients -> waits for exactly 3
    // -----------------------------------------------------------------------

    const numberToWait = Math.min(3, laterCheckedIn.length);

    // -----------------------------------------------------------------------
    // No later checked-in patients.
    //
    // The late patient has nobody to wait for.
    // They are immediately eligible.
    // -----------------------------------------------------------------------

    if (numberToWait === 0) {
      return {
        id: entry.id,
        queueNumber: entry.queueNumber,
        checkedInAt: entry.checkedInAt,
        appointmentTime,
        effectiveTime: appointmentTimeValue,
        isLate: true,
      };
    }

    // -----------------------------------------------------------------------
    // The late patient must be positioned after the Nth later checked-in
    // patient.
    //
    // Example:
    //
    // A = 09:00 late
    // B = 09:30 checked in
    // C = 10:00 checked in
    // D = 10:30 checked in
    //
    // A waits for B, C, D.
    // Therefore A's effective position is AFTER D.
    //
    // We use a fractional position immediately after the cutoff
    // appointment time so another patient with exactly the cutoff
    // appointment time remains before the late patient.
    // -----------------------------------------------------------------------

    const cutoffPatient = laterCheckedIn[numberToWait - 1];

    const cutoffTime = getAppointmentTimeOfDay(cutoffPatient.appointmentTime);

    return {
      id: entry.id,
      queueNumber: entry.queueNumber,
      checkedInAt: entry.checkedInAt,
      appointmentTime,
      effectiveTime: cutoffTime + 0.5,
      isLate: true,
    };
  });

  // -------------------------------------------------------------------------
  // Sort candidates.
  //
  // effectiveTime determines the patient's position in the queue.
  //
  // queueNumber is the final tie-breaker.
  // -------------------------------------------------------------------------

  candidates.sort((a, b) => {
    if (a.effectiveTime !== b.effectiveTime) {
      return a.effectiveTime - b.effectiveTime;
    }

    return a.queueNumber - b.queueNumber;
  });

  return candidates[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Check in patient
// ---------------------------------------------------------------------------

export async function checkIn(
  clinicId: string,
  createdById: string,
  input: CheckInInput,
  resolvedDoctorId?: string
): Promise<QueueEntrySummary> {
  const queueDate = getTodayDate();

  // Which doctor's queue? (resolved from the caller / body, or the appointment)
  let doctorId = resolvedDoctorId;

  const patient = await prisma.patient.findFirst({
    where: {
      id: input.patientId,
      clinicId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!patient) {
    throw new NotFoundError("Patient not found or has been deleted");
  }

  if (input.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        clinicId,
        patientId: input.patientId,
        status: {
          in: ["SCHEDULED", "CONFIRMED"],
        },
        appointmentDate: queueDate,
      },
      select: {
        id: true,
        visitId: true,
        doctorId: true,
      },
    });

    if (!appointment) {
      throw new NotFoundError(
        "Appointment not found, does not belong to this patient, is not scheduled or confirmed, or is not for today"
      );
    }

    if (appointment.visitId) {
      throw new ConflictError("Appointment already has a visit linked to it");
    }

    if (appointment.doctorId) {
      if (doctorId && doctorId !== appointment.doctorId) {
        throw new BadRequestError(
          "This appointment belongs to another doctor. Change the appointment's doctor first, or check in without an appointment."
        );
      }
      doctorId = appointment.doctorId;
    }
  }

  const queueDoctorId = requireDoctor(doctorId);
  await assertDoctorActive(queueDoctorId, clinicId);

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const existingEntry = await tx.queueEntry.findFirst({
        where: {
          clinicId,
          queueDate,
          status: {
            in: ["WAITING", "IN_PROGRESS"],
          },
          visit: {
            patientId: input.patientId,
          },
        },
        select: { id: true },
      });

      if (existingEntry) {
        throw new ConflictError(
          "Patient already has an active queue entry for today"
        );
      }

      const visit = await tx.visit.create({
        data: {
          clinicId,
          patientId: input.patientId,
          doctorId: queueDoctorId,
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

      const queueNumber = await generateQueueNumber(
        tx,
        queueDoctorId,
        queueDate
      );

      const queueEntry = await tx.queueEntry.create({
        data: {
          clinicId,
          doctorId: queueDoctorId,
          visitId: visit.id,
          createdById,
          updatedById: createdById,
          queueDate,
          queueNumber,
          isReserved: false,
          status: "WAITING",
          checkedInAt: new Date(),
        },
        select: queueEntrySummarySelect,
      });

      return queueEntry;
    });

    return entry as QueueEntrySummary;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // Two receptionists checked in at the same moment and got the same
      // number, or the patient already has a visit with this doctor today.
      throw new ConflictError(
        "Could not check the patient in (duplicate entry or queue changed). Please retry."
      );
    }

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reserve slot — checkedInAt intentionally NOT set
// ---------------------------------------------------------------------------

export async function reserveSlot(
  clinicId: string,
  createdById: string,
  input: ReserveSlotInput,
  resolvedDoctorId?: string
): Promise<QueueEntrySummary> {
  const queueDate = getTodayDate();
  const doctorId = requireDoctor(resolvedDoctorId);
  await assertDoctorActive(doctorId, clinicId);

  const existing = await prisma.queueEntry.findFirst({
    where: {
      doctorId,
      queueDate,
      queueNumber: input.queueNumber,
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(
      `Queue number ${input.queueNumber} is already taken for this doctor today`
    );
  }

  const entry = await prisma.queueEntry.create({
    data: {
      clinicId,
      doctorId,
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
  const { status, doctorId, date, page = 1, limit = 20 } = filters;

  const queueDate = parseDateFilter(date);
  const skip = (page - 1) * limit;

  const where = {
    clinicId,
    queueDate,
    ...(status ? { status } : {}),
    ...(doctorId ? { doctorId } : {}),
  };

  const [total, entries] = await prisma.$transaction([
    prisma.queueEntry.count({ where }),
    prisma.queueEntry.findMany({
      where,
      select: queueEntrySummarySelect,
      orderBy: [{ doctorId: "asc" }, { queueNumber: "asc" }],
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
  const entry = await prisma.queueEntry.findFirst({
    where: {
      id,
      clinicId,
    },
    select: queueEntrySummarySelect,
  });

  if (!entry) {
    throw new NotFoundError("Queue entry not found");
  }

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Call next patient
// ---------------------------------------------------------------------------

export async function callNext(
  clinicId: string,
  updatedById: string,
  resolvedDoctorId?: string
): Promise<QueueEntrySummary> {
  const queueDate = getTodayDate();
  const doctorId = requireDoctor(resolvedDoctorId);
  await assertDoctorActive(doctorId, clinicId);

  const entry = await prisma.$transaction(async (tx) => {
    // One patient at a time PER DOCTOR
    const inProgress = await tx.queueEntry.findFirst({
      where: {
        clinicId,
        doctorId,
        queueDate,
        status: "IN_PROGRESS",
      },
      select: {
        id: true,
        queueNumber: true,
      },
    });

    if (inProgress) {
      throw new ConflictError(
        `Patient #${inProgress.queueNumber} is currently being served. Please complete or cancel before calling next.`
      );
    }

    // -----------------------------------------------------------------------
    // IMPORTANT:
    // The next patient is selected exclusively by the shared priority
    // algorithm.
    // -----------------------------------------------------------------------

    const nextId = await selectNextWaiting(tx, clinicId, doctorId, queueDate);

    if (!nextId) {
      throw new NotFoundError("No waiting patients in the queue");
    }

    const result = await tx.queueEntry.updateMany({
      where: {
        id: nextId,
        clinicId,
        status: "WAITING",
      },
      data: {
        status: "IN_PROGRESS",
        calledAt: new Date(),
        updatedById,
      },
    });

    if (result.count === 0) {
      throw new ConflictError(
        "Queue state changed during request. Please retry."
      );
    }

    const updated = await tx.queueEntry.findFirst({
      where: {
        id: nextId,
        clinicId,
      },
      select: queueEntrySummarySelect,
    });

    if (!updated) {
      throw new NotFoundError("Queue entry not found after update");
    }

    return updated;
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Start consultation
// ---------------------------------------------------------------------------

export async function startConsultation(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<QueueEntrySummary> {
  const existing = await findEntryOrThrow(id, clinicId);

  if (existing.status !== "IN_PROGRESS") {
    throw new BadRequestError(
      `Cannot start consultation: entry must be IN_PROGRESS (current: ${existing.status})`
    );
  }

  if (existing.startedAt !== null) {
    throw new ConflictError(
      "Consultation has already been started for this queue entry"
    );
  }

  const now = new Date();

  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.queueEntry.update({
      where: { id },
      data: {
        startedAt: now,
        updatedById,
      },
      select: queueEntrySummarySelect,
    });

    if (existing.visitId) {
      await tx.visit.update({
        where: { id: existing.visitId },
        data: {
          startedAt: now,
        },
      });
    }

    return updated;
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Mark as served — preserves checkedInAt and startedAt
// ---------------------------------------------------------------------------

export async function markServed(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<QueueEntrySummary> {
  const existing = await findEntryOrThrow(id, clinicId);

  assertStatusTransition(existing.status, "SERVED");

  const now = new Date();

  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.queueEntry.update({
      where: { id },
      data: {
        status: "SERVED",
        servedAt: now,
        updatedById,
      },
      select: queueEntrySummarySelect,
    });

    if (existing.visitId) {
      await tx.visit.update({
        where: { id: existing.visitId },
        data: {
          completedAt: now,
        },
      });
    }

    return updated;
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Skip patient — resets calledAt AND startedAt, preserves checkedInAt
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
      startedAt: null,
      updatedById,
    },
    select: queueEntrySummarySelect,
  });

  return entry as QueueEntrySummary;
}

// ---------------------------------------------------------------------------
// Recall patient
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
      ...(existing.doctorId ? { doctorId: existing.doctorId } : {}),
      queueDate: getTodayDate(),
      status: "IN_PROGRESS",
    },
    select: {
      id: true,
      queueNumber: true,
    },
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
  clinicId: string,
  resolvedDoctorId?: string
): Promise<QueueStatus_Current> {
  const queueDate = getTodayDate();
  const doctorId = requireDoctor(resolvedDoctorId);

  const base = { clinicId, doctorId, queueDate };

  // Use the same priority selector as callNext()
  const nextWaitingId = await selectNextWaiting(
    prisma,
    clinicId,
    doctorId,
    queueDate
  );

  // Always execute valid Prisma queries inside $transaction
  const [currentlyServing, waitingCount, servedCount] =
    await prisma.$transaction([
      prisma.queueEntry.findFirst({
        where: { ...base, status: "IN_PROGRESS" },
        select: queueEntrySummarySelect,
        orderBy: {
          calledAt: "desc",
        },
      }),

      prisma.queueEntry.count({
        where: { ...base, status: "WAITING" },
      }),

      prisma.queueEntry.count({
        where: { ...base, status: "SERVED" },
      }),
    ]);

  // This query is optional, so execute it separately.
  const nextWaiting = nextWaitingId
    ? await prisma.queueEntry.findFirst({
        where: { ...base, id: nextWaitingId, status: "WAITING" },
        select: queueEntrySummarySelect,
      })
    : null;

  return {
    currentlyServing: currentlyServing as QueueEntrySummary | null,
    nextWaiting: nextWaiting as QueueEntrySummary | null,
    waitingCount,
    servedCount,
  };
}

// ---------------------------------------------------------------------------
// Get queue status for EVERY doctor (reception overview)
// ---------------------------------------------------------------------------

export async function getAllDoctorsQueueStatus(
  clinicId: string
): Promise<DoctorQueueStatus[]> {
  const doctors = await prisma.doctor.findMany({
    where: { clinicId, user: { isActive: true } },
    select: {
      id: true,
      specialty: true,
      user: { select: { fullName: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  return Promise.all(
    doctors.map(async (d) => ({
      doctor: {
        id: d.id,
        fullName: d.user.fullName,
        specialty: d.specialty,
      },
      ...(await getQueueStatus(clinicId, d.id)),
    }))
  );
}

// ---------------------------------------------------------------------------
// Get queue statistics
// ---------------------------------------------------------------------------

export async function getQueueStatistics(
  clinicId: string,
  date?: string,
  doctorId?: string
): Promise<QueueStatistics> {
  const queueDate = parseDateFilter(date);
  const base = { clinicId, queueDate, ...(doctorId ? { doctorId } : {}) };

  const [total, waiting, inProgress, served, cancelled, servedEntries] =
    await prisma.$transaction([
      prisma.queueEntry.count({
        where: base,
      }),

      prisma.queueEntry.count({
        where: {
          ...base,
          status: "WAITING",
        },
      }),

      prisma.queueEntry.count({
        where: {
          ...base,
          status: "IN_PROGRESS",
        },
      }),

      prisma.queueEntry.count({
        where: {
          ...base,
          status: "SERVED",
        },
      }),

      prisma.queueEntry.count({
        where: {
          ...base,
          status: "CANCELLED",
        },
      }),

      prisma.queueEntry.findMany({
        where: {
          ...base,
          status: "SERVED",
          isReserved: false,
          checkedInAt: {
            not: null,
          },
          calledAt: {
            not: null,
          },
          startedAt: {
            not: null,
          },
          servedAt: {
            not: null,
          },
        },
        select: {
          checkedInAt: true,
          calledAt: true,
          startedAt: true,
          servedAt: true,
        },
      }),
    ]);

  let averageWaitTimeMinutes: number | null = null;
  let averageServeTimeMinutes: number | null = null;

  if (servedEntries.length > 0) {
    const waitTimes = servedEntries
      .filter((e) => e.calledAt !== null && e.checkedInAt !== null)
      .map(
        (e) => (e.calledAt!.getTime() - e.checkedInAt!.getTime()) / 1000 / 60
      )
      .filter((t) => t >= 0);

    const serveTimes = servedEntries
      .filter((e) => e.servedAt !== null && e.startedAt !== null)
      .map((e) => (e.servedAt!.getTime() - e.startedAt!.getTime()) / 1000 / 60)
      .filter((t) => t >= 0);

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
  updatedById: string,
  resolvedDoctorId?: string
): Promise<{ cancelled: number }> {
  const queueDate = getTodayDate();

  const result = await prisma.queueEntry.updateMany({
    where: {
      clinicId,
      // A doctor resets only their own queue; reception may reset one doctor
      // or (no doctorId) every queue.
      ...(resolvedDoctorId ? { doctorId: resolvedDoctorId } : {}),
      queueDate,
      status: {
        in: ["WAITING", "IN_PROGRESS"],
      },
    },
    data: {
      status: "CANCELLED",
      updatedById,
    },
  });

  return {
    cancelled: result.count,
  };
}

// ---------------------------------------------------------------------------
// Public waiting-room board
//
// One card per doctor: who is being served now, who is next (same priority
// rule as callNext) and how many are waiting. Only doctors who have at least
// one queue entry today are listed, unless a specific doctor was requested.
// ---------------------------------------------------------------------------

export async function getWaitingBoard(
  clinicId: string,
  onlyDoctorId?: string
): Promise<WaitingBoard> {
  const queueDate = getTodayDate();

  const settings = await prisma.clinicSettings.findUnique({
    where: { clinicId },
    select: { waitingScreenMode: true },
  });
  const mode = settings?.waitingScreenMode ?? "NUMBERS";

  const doctors = await prisma.doctor.findMany({
    where: {
      clinicId,
      user: { isActive: true },
      ...(onlyDoctorId
        ? { id: onlyDoctorId }
        : { queueEntries: { some: { queueDate } } }),
    },
    select: {
      id: true,
      specialty: true,
      user: { select: { fullName: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  const boardSelect = {
    queueNumber: true,
    reservedFor: true,
    visit: { select: { patient: { select: { fullName: true } } } },
  } as const;

  type BoardRow = {
    queueNumber: number;
    reservedFor: string | null;
    visit: { patient: { fullName: string } } | null;
  };

  const toEntry = (row: BoardRow | null): WaitingBoardEntry | null => {
    if (!row) return null;
    const rawName = row.visit?.patient.fullName ?? row.reservedFor ?? null;
    return {
      queueNumber: row.queueNumber,
      patientName: mode === "NAMES" && rawName ? maskName(rawName) : null,
    };
  };

  const cards = await Promise.all(
    doctors.map(async (d) => {
      const nextId = await selectNextWaiting(prisma, clinicId, d.id, queueDate);

      const [nowServing, next, waitingCount] = await prisma.$transaction([
        prisma.queueEntry.findFirst({
          where: {
            clinicId,
            doctorId: d.id,
            queueDate,
            status: "IN_PROGRESS",
          },
          select: boardSelect,
          orderBy: { calledAt: "desc" },
        }),
        prisma.queueEntry.findFirst({
          where: {
            clinicId,
            doctorId: d.id,
            queueDate,
            status: "WAITING",
            // no match when nobody is waiting
            id: nextId ?? "00000000-0000-0000-0000-000000000000",
          },
          select: boardSelect,
        }),
        prisma.queueEntry.count({
          where: { clinicId, doctorId: d.id, queueDate, status: "WAITING" },
        }),
      ]);

      return {
        doctorId: d.id,
        fullName: d.user.fullName,
        specialty: d.specialty,
        nowServing: toEntry(nowServing),
        next: toEntry(next),
        waitingCount,
      };
    })
  );

  return {
    mode,
    generatedAt: new Date().toISOString(),
    doctors: cards,
  };
}
