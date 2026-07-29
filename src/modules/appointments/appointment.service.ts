// src/modules/appointments/appointment.service.ts

import prisma from "../../config/database";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../shared/errors/AppError";
import { ApiResponse } from "../../shared/utils/apiResponse";
import { ALLOWED_STATUS_TRANSITIONS } from "./appointment.types";
import type {
  AppointmentFilters,
  AppointmentListResult,
  AppointmentSummary,
  AppointmentDetail,
} from "./appointment.types";
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from "./appointment.validation";
import type { AppointmentStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared selects
// ---------------------------------------------------------------------------

const appointmentSummarySelect = {
  id: true,
  clinicId: true,
  patientId: true,
  visitId: true,
  appointmentDate: true,
  appointmentTime: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      mrn: true,
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

const appointmentDetailSelect = {
  ...appointmentSummarySelect,
  visit: {
    select: {
      id: true,
      visitDate: true,
      chiefComplaint: true,
      diagnosis: true,
      treatment: true,
      prescription: true,
      notes: true,
      createdAt: true,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAppointmentDateTime(date: string, time: string): Date {
  const combined = new Date(`${date}T${time}:00.000Z`);
  return combined;
}

function buildDateRangeFilter(
  date?: string,
  fromDate?: string,
  toDate?: string
): object {
  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    return { appointmentDate: { gte: start, lte: end } };
  }

  if (fromDate || toDate) {
    const range: Record<string, Date> = {};
    if (fromDate) range.gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (toDate) range.lte = new Date(`${toDate}T23:59:59.999Z`);
    return { appointmentDate: range };
  }

  return {};
}

async function assertPatientExists(
  patientId: string,
  clinicId: string
): Promise<void> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId, deletedAt: null },
    select: { id: true },
  });

  if (!patient) {
    throw new NotFoundError("Patient not found or has been deleted");
  }
}

async function assertNoTimeConflict(
  clinicId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeId?: string
): Promise<void> {
  const dateTime = buildAppointmentDateTime(appointmentDate, appointmentTime);

  const existing = await prisma.appointment.findFirst({
    where: {
      clinicId,
      appointmentDate: dateTime,
      appointmentTime: dateTime,
      status: { not: "CANCELLED" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(
      `An appointment already exists at ${appointmentTime} on ${appointmentDate}`
    );
  }
}

async function findAppointmentOrThrow(
  id: string,
  clinicId: string
): Promise<{ id: string; status: AppointmentStatus }> {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { id: true, status: true },
  });

  if (!appointment) {
    throw new NotFoundError("Appointment not found");
  }

  return appointment;
}

function assertStatusTransition(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
): void {
  const isAllowed = ALLOWED_STATUS_TRANSITIONS.some(
    (t) => t.from === currentStatus && t.to === targetStatus
  );

  if (!isAllowed) {
    throw new BadRequestError(
      `Cannot transition appointment from "${currentStatus}" to "${targetStatus}"`
    );
  }
}

// ---------------------------------------------------------------------------
// Create appointment
// ---------------------------------------------------------------------------

export async function createAppointment(
  clinicId: string,
  createdById: string,
  input: CreateAppointmentInput
): Promise<AppointmentSummary> {
  await assertPatientExists(input.patientId, clinicId);
  await assertNoTimeConflict(
    clinicId,
    input.appointmentDate,
    input.appointmentTime
  );

  const dateTime = buildAppointmentDateTime(
    input.appointmentDate,
    input.appointmentTime
  );

  const appointment = await prisma.appointment.create({
    data: {
      clinicId,
      createdById,
      updatedById: createdById,
      patientId: input.patientId,
      appointmentDate: dateTime,
      appointmentTime: dateTime,
      status: "SCHEDULED",
      notes: input.notes ?? null,
    },
    select: appointmentSummarySelect,
  });

  return appointment as AppointmentSummary;
}

// ---------------------------------------------------------------------------
// Get appointment by ID
// ---------------------------------------------------------------------------

export async function getAppointmentById(
  id: string,
  clinicId: string
): Promise<AppointmentDetail> {
  await findAppointmentOrThrow(id, clinicId);

  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: appointmentDetailSelect,
  });

  if (!appointment) {
    throw new NotFoundError("Appointment not found");
  }

  return appointment as AppointmentDetail;
}

// ---------------------------------------------------------------------------
// List appointments
// ---------------------------------------------------------------------------

export async function listAppointments(
  clinicId: string,
  filters: AppointmentFilters
): Promise<AppointmentListResult> {
  const {
    search,
    status,
    patientId,
    date,
    fromDate,
    toDate,
    page = 1,
    limit = 10,
  } = filters;

  const skip = (page - 1) * limit;

  const dateRangeFilter = buildDateRangeFilter(date, fromDate, toDate);

  const where = {
    clinicId,
    ...(status ? { status } : {}),
    ...(patientId ? { patientId } : {}),
    ...dateRangeFilter,
    ...(search
      ? {
          patient: {
            OR: [
              { fullName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { mrn: { contains: search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, appointments] = await prisma.$transaction([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      select: appointmentSummarySelect,
      orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }],
      skip,
      take: limit,
    }),
  ]);

  return {
    appointments: appointments as AppointmentSummary[],
    meta: ApiResponse.buildPaginationMeta(total, page, limit),
  };
}

// ---------------------------------------------------------------------------
// Update appointment
// ---------------------------------------------------------------------------

export async function updateAppointment(
  id: string,
  clinicId: string,
  updatedById: string,
  input: UpdateAppointmentInput
): Promise<AppointmentSummary> {
  const existing = await findAppointmentOrThrow(id, clinicId);

  if (existing.status !== "SCHEDULED") {
    throw new BadRequestError("Only scheduled appointments can be updated");
  }

  if (input.appointmentDate || input.appointmentTime) {
    const current = await prisma.appointment.findUnique({
      where: { id },
      select: { appointmentDate: true, appointmentTime: true },
    });

    if (!current) throw new NotFoundError("Appointment not found");

    const currentDate = current.appointmentDate.toISOString().split("T")[0];
    const currentTime = current.appointmentTime
      .toISOString()
      .split("T")[1]
      .substring(0, 5);

    const newDate = input.appointmentDate ?? currentDate;
    const newTime = input.appointmentTime ?? currentTime;

    await assertNoTimeConflict(clinicId, newDate, newTime, id);

    const dateTime = buildAppointmentDateTime(newDate, newTime);

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        updatedById,
        appointmentDate: dateTime,
        appointmentTime: dateTime,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      select: appointmentSummarySelect,
    });

    return appointment as AppointmentSummary;
  }

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      updatedById,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    select: appointmentSummarySelect,
  });

  return appointment as AppointmentSummary;
}

// ---------------------------------------------------------------------------
// Cancel appointment
// ---------------------------------------------------------------------------

export async function cancelAppointment(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<AppointmentSummary> {
  const existing = await findAppointmentOrThrow(id, clinicId);

  assertStatusTransition(existing.status, "CANCELLED");

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      status: "CANCELLED",
      updatedById,
    },
    select: appointmentSummarySelect,
  });

  return appointment as AppointmentSummary;
}

// ---------------------------------------------------------------------------
// Complete appointment
// ---------------------------------------------------------------------------

export async function completeAppointment(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<AppointmentSummary> {
  const existing = await findAppointmentOrThrow(id, clinicId);

  assertStatusTransition(existing.status, "COMPLETED");

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      status: "COMPLETED",
      updatedById,
    },
    select: appointmentSummarySelect,
  });

  return appointment as AppointmentSummary;
}
