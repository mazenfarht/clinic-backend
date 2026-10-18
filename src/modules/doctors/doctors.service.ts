// src/modules/doctors/doctors.service.ts

import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import prisma from "../../config/database";
import config from "../../config";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";
import type {
  CreateDoctorInput,
  UpdateDoctorInput,
} from "./doctors.validation";

export const doctorSelect = {
  id: true,
  clinicId: true,
  specialty: true,
  bio: true,
  appointmentDuration: true,
  workingHours: true,
  isBookable: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: { id: true, fullName: true, email: true, isActive: true },
  },
} as const;

// ---------------------------------------------------------------------------
// List doctors of a clinic (staff)
// ---------------------------------------------------------------------------

export async function listDoctors(clinicId: string) {
  return prisma.doctor.findMany({
    where: { clinicId },
    select: doctorSelect,
    orderBy: { user: { fullName: "asc" } },
  });
}

// ---------------------------------------------------------------------------
// Create doctor: user account (role DOCTOR) + profile, atomically
// ---------------------------------------------------------------------------

export async function createDoctor(clinicId: string, input: CreateDoctorInput) {
  const existing = await prisma.user.findFirst({
    where: { email: input.email, clinicId },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(
    input.password,
    config.bcrypt.saltRounds
  );

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          clinicId,
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          role: "DOCTOR",
        },
        select: { id: true },
      });

      return tx.doctor.create({
        data: {
          clinicId,
          userId: user.id,
          specialty: input.specialty,
          bio: input.bio ?? null,
          appointmentDuration: input.appointmentDuration ?? null,
          workingHours: input.workingHours ?? Prisma.JsonNull,
          isBookable: input.isBookable ?? true,
        },
        select: doctorSelect,
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ConflictError("A user with this email already exists");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Update doctor profile
// ---------------------------------------------------------------------------

export async function updateDoctor(
  id: string,
  clinicId: string,
  input: UpdateDoctorInput
) {
  const doctor = await prisma.doctor.findFirst({
    where: { id, clinicId },
    select: { id: true },
  });
  if (!doctor) throw new NotFoundError("Doctor not found");

  return prisma.doctor.update({
    where: { id },
    data: {
      ...(input.specialty !== undefined ? { specialty: input.specialty } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.appointmentDuration !== undefined
        ? { appointmentDuration: input.appointmentDuration }
        : {}),
      ...(input.workingHours !== undefined
        ? { workingHours: input.workingHours ?? Prisma.JsonNull }
        : {}),
      ...(input.isBookable !== undefined
        ? { isBookable: input.isBookable }
        : {}),
    },
    select: doctorSelect,
  });
}
