// src/modules/patients/patient.service.ts

import prisma from "../../config/database";
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
} from "../../shared/errors/AppError";
import { ApiResponse } from "../../shared/utils/apiResponse";
import type {
  PatientDetail,
  PatientFilters,
  PatientListResult,
  PatientSummary,
} from "./patient.types";
import type {
  CreatePatientInput,
  UpdatePatientInput,
} from "./patient.validation";

// ---------------------------------------------------------------------------
// Shared select — used across all queries for consistency
// ---------------------------------------------------------------------------

const patientSummarySelect = {
  id: true,
  clinicId: true,
  mrn: true,
  fullName: true,
  phone: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  notes: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
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

const patientDetailSelect = {
  ...patientSummarySelect,
  visits: {
    select: {
      id: true,
      visitDate: true,
      chiefComplaint: true,
      diagnosis: true,
      createdAt: true,
    },
    orderBy: { visitDate: "desc" as const },
  },
  appointments: {
    select: {
      id: true,
      appointmentDate: true,
      appointmentTime: true,
      status: true,
      notes: true,
    },
    orderBy: { appointmentDate: "desc" as const },
  },
} as const;

// ---------------------------------------------------------------------------
// Duplicate checks
// ---------------------------------------------------------------------------

async function assertUniqueMrn(
  clinicId: string,
  mrn: string,
  excludeId?: string
): Promise<void> {
  const existing = await prisma.patient.findFirst({
    where: {
      clinicId,
      mrn,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(
      `A patient with MRN "${mrn}" already exists in this clinic`
    );
  }
}

async function assertUniquePhone(
  clinicId: string,
  phone: string,
  excludeId?: string
): Promise<void> {
  const existing = await prisma.patient.findFirst({
    where: {
      clinicId,
      phone,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(
      `A patient with phone "${phone}" already exists in this clinic`
    );
  }
}

// ---------------------------------------------------------------------------
// Find patient or throw
// ---------------------------------------------------------------------------

async function findPatientOrThrow(
  id: string,
  clinicId: string,
  includeDeleted = false
): Promise<{ id: string; deletedAt: Date | null }> {
  const patient = await prisma.patient.findFirst({
    where: {
      id,
      clinicId,
      ...(!includeDeleted ? { deletedAt: null } : {}),
    },
    select: { id: true, deletedAt: true },
  });

  if (!patient) {
    throw new NotFoundError(`Patient not found`);
  }

  return patient;
}

// ---------------------------------------------------------------------------
// Create patient
// ---------------------------------------------------------------------------

export async function createPatient(
  clinicId: string,
  createdById: string,
  input: CreatePatientInput
): Promise<PatientSummary> {
  await assertUniqueMrn(clinicId, input.mrn);
  await assertUniquePhone(clinicId, input.phone);

  const patient = await prisma.patient.create({
    data: {
      clinicId,
      createdById,
      updatedById: createdById,
      mrn: input.mrn,
      fullName: input.fullName,
      phone: input.phone,
      dateOfBirth: new Date(input.dateOfBirth),
      gender: input.gender,
      address: input.address ?? null,
      notes: input.notes ?? null,
    },
    select: patientSummarySelect,
  });

  return patient as PatientSummary;
}

// ---------------------------------------------------------------------------
// Get patient by ID
// ---------------------------------------------------------------------------

export async function getPatientById(
  id: string,
  clinicId: string
): Promise<PatientDetail> {
  await findPatientOrThrow(id, clinicId);

  const patient = await prisma.patient.findFirst({
    where: { id, clinicId, deletedAt: null },
    select: patientDetailSelect,
  });

  if (!patient) {
    throw new NotFoundError("Patient not found");
  }

  return patient as PatientDetail;
}

// ---------------------------------------------------------------------------
// List patients
// ---------------------------------------------------------------------------

export async function listPatients(
  clinicId: string,
  filters: PatientFilters
): Promise<PatientListResult> {
  const {
    search,
    gender,
    includeDeleted = false,
    page = 1,
    limit = 10,
  } = filters;

  const skip = (page - 1) * limit;

  const where = {
    clinicId,
    ...(!includeDeleted ? { deletedAt: null } : {}),
    ...(gender ? { gender } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
            { mrn: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, patients] = await prisma.$transaction([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      select: patientSummarySelect,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    patients: patients as PatientSummary[],
    meta: ApiResponse.buildPaginationMeta(total, page, limit),
  };
}

// ---------------------------------------------------------------------------
// Update patient
// ---------------------------------------------------------------------------

export async function updatePatient(
  id: string,
  clinicId: string,
  updatedById: string,
  input: UpdatePatientInput
): Promise<PatientSummary> {
  await findPatientOrThrow(id, clinicId);

  if (input.phone) {
    await assertUniquePhone(clinicId, input.phone, id);
  }

  const patient = await prisma.patient.update({
    where: { id },
    data: {
      ...input,
      updatedById,
      ...(input.dateOfBirth
        ? { dateOfBirth: new Date(input.dateOfBirth) }
        : {}),
    },
    select: patientSummarySelect,
  });

  return patient as PatientSummary;
}

// ---------------------------------------------------------------------------
// Soft delete patient
// ---------------------------------------------------------------------------

export async function softDeletePatient(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<void> {
  const patient = await findPatientOrThrow(id, clinicId);

  if (patient.deletedAt !== null) {
    throw new BadRequestError("Patient is already deleted");
  }

  await prisma.patient.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      updatedById,
    },
  });
}

// ---------------------------------------------------------------------------
// Restore soft-deleted patient
// ---------------------------------------------------------------------------

export async function restorePatient(
  id: string,
  clinicId: string,
  updatedById: string
): Promise<PatientSummary> {
  const patient = await findPatientOrThrow(id, clinicId, true);

  if (patient.deletedAt === null) {
    throw new BadRequestError("Patient is not deleted");
  }

  const restored = await prisma.patient.update({
    where: { id },
    data: {
      deletedAt: null,
      updatedById,
    },
    select: patientSummarySelect,
  });

  return restored as PatientSummary;
}
