// src/modules/clinic-settings/clinic-settings.service.ts

import prisma from "../../config/database";
import { NotFoundError } from "../../shared/errors/AppError";
import type { ClinicSettingsResponse } from "./clinic-settings.types";
import type { UpdateClinicSettingsInput } from "./clinic-settings.validation";

// ---------------------------------------------------------------------------
// Shared select
// ---------------------------------------------------------------------------

const clinicSettingsSelect = {
  id: true,
  clinicId: true,
  workingHours: true,
  maxPatientsPerDay: true,
  createdAt: true,
  updatedAt: true,
  clinic: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findClinicOrThrow(clinicId: string): Promise<{ id: string }> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true },
  });

  if (!clinic) {
    throw new NotFoundError("Clinic not found");
  }

  return clinic;
}

async function ensureSettingsExist(clinicId: string): Promise<{ id: string }> {
  const existing = await prisma.clinicSettings.findUnique({
    where: { clinicId },
    select: { id: true },
  });

  if (existing) return existing;

  const created = await prisma.clinicSettings.create({
    data: {
      clinicId,
      workingHours: {
        monday: { open: "09:00", close: "17:00", isOpen: true },
        tuesday: { open: "09:00", close: "17:00", isOpen: true },
        wednesday: { open: "09:00", close: "17:00", isOpen: true },
        thursday: { open: "09:00", close: "17:00", isOpen: true },
        friday: { open: "09:00", close: "17:00", isOpen: true },
        saturday: { open: "09:00", close: "14:00", isOpen: false },
        sunday: { open: "09:00", close: "14:00", isOpen: false },
      },
      maxPatientsPerDay: 50,
    },
    select: { id: true },
  });

  return created;
}

// ---------------------------------------------------------------------------
// Get clinic settings
// ---------------------------------------------------------------------------

export async function getClinicSettings(
  clinicId: string
): Promise<ClinicSettingsResponse> {
  await findClinicOrThrow(clinicId);
  await ensureSettingsExist(clinicId);

  const settings = await prisma.clinicSettings.findUnique({
    where: { clinicId },
    select: clinicSettingsSelect,
  });

  if (!settings) {
    throw new NotFoundError("Clinic settings not found");
  }

  return settings as unknown as ClinicSettingsResponse;
}

// ---------------------------------------------------------------------------
// Update clinic settings
// ---------------------------------------------------------------------------

export async function updateClinicSettings(
  clinicId: string,
  input: UpdateClinicSettingsInput
): Promise<ClinicSettingsResponse> {
  await findClinicOrThrow(clinicId);
  await ensureSettingsExist(clinicId);

  const { name, phone, email, address, workingHours, maxPatientsPerDay } =
    input;

  const hasClinicFields =
    name !== undefined ||
    phone !== undefined ||
    email !== undefined ||
    address !== undefined;
  const hasSettingsFields =
    workingHours !== undefined || maxPatientsPerDay !== undefined;

  const settings = await prisma.$transaction(async (tx) => {
    if (hasClinicFields) {
      await tx.clinic.update({
        where: { id: clinicId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(address !== undefined ? { address } : {}),
        },
      });
    }

    if (hasSettingsFields) {
      await tx.clinicSettings.update({
        where: { clinicId },
        data: {
          ...(workingHours !== undefined ? { workingHours } : {}),
          ...(maxPatientsPerDay !== undefined ? { maxPatientsPerDay } : {}),
        },
      });
    }

    return tx.clinicSettings.findUnique({
      where: { clinicId },
      select: clinicSettingsSelect,
    });
  });

  if (!settings) {
    throw new NotFoundError("Clinic settings not found");
  }

  return settings as unknown as ClinicSettingsResponse;
}
