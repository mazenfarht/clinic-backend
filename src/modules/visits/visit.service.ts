// src/modules/visits/visit.service.ts

import prisma from '../../config/database';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '../../shared/errors/AppError';
import { ApiResponse } from '../../shared/utils/apiResponse';
import type {
  VisitDetail,
  VisitFilters,
  VisitListResult,
  VisitSummary,
} from './visit.types';
import type { CreateVisitInput, UpdateVisitInput } from './visit.validation';

// ---------------------------------------------------------------------------
// Shared selects
// ---------------------------------------------------------------------------

const visitSummarySelect = {
  id: true,
  clinicId: true,
  patientId: true,
  visitDate: true,
  chiefComplaint: true,
  diagnosis: true,
  treatment: true,
  prescription: true,
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

const visitDetailSelect = {
  ...visitSummarySelect,
  appointment: {
    select: {
      id: true,
      appointmentDate: true,
      appointmentTime: true,
      status: true,
      notes: true,
    },
  },
  queueEntry: {
    select: {
      id: true,
      queueNumber: true,
      status: true,
      calledAt: true,
      servedAt: true,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDateRangeFilter(
  date?: string,
  fromDate?: string,
  toDate?: string,
): object {
  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    return { visitDate: { gte: start, lte: end } };
  }

  if (fromDate || toDate) {
    const range: Record<string, Date> = {};
    if (fromDate) range.gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (toDate) range.lte = new Date(`${toDate}T23:59:59.999Z`);
    return { visitDate: range };
  }

  return {};
}

async function assertPatientExists(
  patientId: string,
  clinicId: string,
): Promise<void> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId, deletedAt: null },
    select: { id: true },
  });

  if (!patient) {
    throw new NotFoundError('Patient not found or has been deleted');
  }
}

async function assertAppointmentValid(
  appointmentId: string,
  patientId: string,
  clinicId: string,
): Promise<void> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      clinicId,
      patientId,
    },
    select: { id: true, visitId: true, status: true },
  });

  if (!appointment) {
    throw new NotFoundError(
      'Appointment not found or does not belong to this patient',
    );
  }

  if (appointment.status === 'CANCELLED') {
    throw new BadRequestError('Cannot link a visit to a cancelled appointment');
  }

  if (appointment.visitId) {
    throw new ConflictError('Appointment already has a visit linked to it');
  }
}

async function assertQueueEntryValid(
  queueEntryId: string,
  clinicId: string,
): Promise<void> {
  const entry = await prisma.queueEntry.findFirst({
    where: { id: queueEntryId, clinicId },
    select: { id: true, visitId: true },
  });

  if (!entry) {
    throw new NotFoundError('Queue entry not found');
  }

  if (entry.visitId) {
    throw new ConflictError('Queue entry already has a visit linked to it');
  }
}

async function findVisitOrThrow(
  id: string,
  clinicId: string,
): Promise<{ id: string }> {
  const visit = await prisma.visit.findFirst({
    where: { id, clinicId },
    select: { id: true },
  });

  if (!visit) {
    throw new NotFoundError('Visit not found');
  }

  return visit;
}

// ---------------------------------------------------------------------------
// Create visit
// ---------------------------------------------------------------------------

export async function createVisit(
  clinicId: string,
  createdById: string,
  input: CreateVisitInput,
): Promise<VisitDetail> {
  await assertPatientExists(input.patientId, clinicId);

  if (input.appointmentId) {
    await assertAppointmentValid(input.appointmentId, input.patientId, clinicId);
  }

  if (input.queueEntryId) {
    await assertQueueEntryValid(input.queueEntryId, clinicId);
  }

  const visitDate = input.visitDate
    ? new Date(`${input.visitDate}T00:00:00.000Z`)
    : new Date(new Date().setUTCHours(0, 0, 0, 0));

  const existingVisit = await prisma.visit.findFirst({
    where: { clinicId, patientId: input.patientId, visitDate },
    select: { id: true },
  });

  if (existingVisit) {
    throw new ConflictError('Patient already has a visit record for this date');
  }

  const visit = await prisma.$transaction(async (tx) => {
    const created = await tx.visit.create({
      data: {
        clinicId,
        patientId: input.patientId,
        createdById,
        updatedById: createdById,
        visitDate,
        chiefComplaint: input.chiefComplaint ?? null,
        diagnosis: input.diagnosis ?? null,
        treatment: input.treatment ?? null,
        prescription: input.prescription ?? null,
        notes: input.notes ?? null,
      },
      select: visitDetailSelect,
    });

    if (input.appointmentId) {
      await tx.appointment.update({
        where: { id: input.appointmentId },
        data: {
          visitId: created.id,
          updatedById: createdById,
        },
      });
    }

    if (input.queueEntryId) {
      await tx.queueEntry.update({
        where: { id: input.queueEntryId },
        data: {
          visitId: created.id,
          updatedById: createdById,
        },
      });
    }

    return created;
  });

  return visit as VisitDetail;
}

// ---------------------------------------------------------------------------
// Get visit by ID
// ---------------------------------------------------------------------------

export async function getVisitById(
  id: string,
  clinicId: string,
): Promise<VisitDetail> {
  await findVisitOrThrow(id, clinicId);

  const visit = await prisma.visit.findFirst({
    where: { id, clinicId },
    select: visitDetailSelect,
  });

  if (!visit) throw new NotFoundError('Visit not found');

  return visit as VisitDetail;
}

// ---------------------------------------------------------------------------
// List visits
// ---------------------------------------------------------------------------

export async function listVisits(
  clinicId: string,
  filters: VisitFilters,
): Promise<VisitListResult> {
  const {
    search,
    patientId,
    createdById,
    date,
    fromDate,
    toDate,
    sortBy = 'visitDate',
    sortOrder = 'desc',
    page = 1,
    limit = 10,
  } = filters;

  const skip = (page - 1) * limit;
  const dateRangeFilter = buildDateRangeFilter(date, fromDate, toDate);

  const where = {
    clinicId,
    ...(patientId ? { patientId } : {}),
    ...(createdById ? { createdById } : {}),
    ...dateRangeFilter,
    ...(search
      ? {
          patient: {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
              { mrn: { contains: search, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  };

  const [total, visits] = await prisma.$transaction([
    prisma.visit.count({ where }),
    prisma.visit.findMany({
      where,
      select: visitSummarySelect,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
  ]);

  return {
    visits: visits as VisitSummary[],
    meta: ApiResponse.buildPaginationMeta(total, page, limit),
  };
}

// ---------------------------------------------------------------------------
// List visits by patient
// ---------------------------------------------------------------------------

export async function listVisitsByPatient(
  patientId: string,
  clinicId: string,
  filters: VisitFilters,
): Promise<VisitListResult> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { id: true },
  });

  if (!patient) throw new NotFoundError('Patient not found');

  return listVisits(clinicId, { ...filters, patientId });
}

// ---------------------------------------------------------------------------
// Update visit
// ---------------------------------------------------------------------------

export async function updateVisit(
  id: string,
  clinicId: string,
  updatedById: string,
  input: UpdateVisitInput,
): Promise<VisitDetail> {
  await findVisitOrThrow(id, clinicId);

  const visit = await prisma.visit.update({
    where: { id },
    data: {
      ...input,
      updatedById,
    },
    select: visitDetailSelect,
  });

  return visit as VisitDetail;
}

// ---------------------------------------------------------------------------
// Delete visit
// ---------------------------------------------------------------------------

export async function deleteVisit(
  id: string,
  clinicId: string,
): Promise<void> {
  await findVisitOrThrow(id, clinicId);

  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: { visitId: id, clinicId },
      data: { visitId: null },
    });

    await tx.queueEntry.updateMany({
      where: { visitId: id, clinicId },
      data: { visitId: null },
    });

    await tx.visit.delete({
      where: { id },
    });
  });
}