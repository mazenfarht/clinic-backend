// src/modules/admin/clinics/admin-clinics.service.ts
//
// Platform-admin operations on clinics. PRIVACY: the admin sees clinic and
// staff information and COUNTS only. No query here ever selects patient,
// appointment, visit or queue rows.

import bcrypt from "bcrypt";
import type { Prisma } from "@prisma/client";
import prisma from "../../../config/database";
import config from "../../../config";
import { logger } from "../../../middleware/requestLogger.middleware";
import { ApiResponse } from "../../../shared/utils/apiResponse";
import { generatePassword } from "../../../shared/utils/generatePassword";
import { ConflictError, NotFoundError } from "../../../shared/errors/AppError";
import { createDoctor } from "../../doctors/doctors.service";
import type {
  AddDoctorInput,
  CreateClinicInput,
  ListClinicsQuery,
  UpdateClinicInput,
} from "./admin-clinics.validation";

// Egyptian working week: Saturday - Thursday, Friday closed.
const defaultDay = (isOpen: boolean) => ({
  open: "10:00",
  close: "18:00",
  isOpen,
});

export const DEFAULT_WORKING_HOURS = {
  saturday: defaultDay(true),
  sunday: defaultDay(true),
  monday: defaultDay(true),
  tuesday: defaultDay(true),
  wednesday: defaultDay(true),
  thursday: defaultDay(true),
  friday: defaultDay(false),
};

const clinicSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Row counts only — never the rows themselves.
const countsSelect = {
  doctors: true,
  users: { where: { role: "RECEPTIONIST" } },
  patients: { where: { deletedAt: null } },
  appointments: true,
  visits: true,
} satisfies Prisma.ClinicCountOutputTypeSelect;

type CountsRow = {
  doctors: number;
  users: number;
  patients: number;
  appointments: number;
  visits: number;
};

function toCounts(c: CountsRow) {
  return {
    doctors: c.doctors,
    receptionists: c.users,
    patients: c.patients,
    appointments: c.appointments,
    visits: c.visits,
  };
}

export interface Credentials {
  email: string;
  // Shown exactly once, in the response that created / reset it. Only the bcrypt
  // hash is stored, so it cannot be shown again.
  temporaryPassword: string;
}

async function assertClinicNameFree(
  name: string,
  exceptClinicId?: string
): Promise<void> {
  const clash = await prisma.clinic.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptClinicId ? { id: { not: exceptClinicId } } : {}),
    },
    select: { id: true },
  });

  if (clash) {
    throw new ConflictError(
      "A clinic with this name already exists. Use a distinguishing name (for example add the area)."
    );
  }
}

async function findClinicOrThrow(id: string): Promise<{ id: string }> {
  const clinic = await prisma.clinic.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!clinic) throw new NotFoundError("Clinic not found");
  return clinic;
}

// ---------------------------------------------------------------------------
// Create clinic + settings + first doctor — atomically (all or nothing)
// ---------------------------------------------------------------------------

export async function createClinic(input: CreateClinicInput, adminId: string) {
  await assertClinicNameFree(input.clinic.name);

  const temporaryPassword = generatePassword();
  // Hashed before the transaction so the DB transaction stays short.
  const passwordHash = await bcrypt.hash(
    temporaryPassword,
    config.bcrypt.saltRounds
  );

  const s = input.settings ?? {};

  const { clinic, doctor } = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: {
        name: input.clinic.name,
        phone: input.clinic.phone ?? null,
        email: input.clinic.email ?? null,
        address: input.clinic.address ?? null,
        settings: {
          create: {
            workingHours: s.workingHours ?? DEFAULT_WORKING_HOURS,
            ...(s.maxPatientsPerDay !== undefined
              ? { maxPatientsPerDay: s.maxPatientsPerDay }
              : {}),
            ...(s.appointmentDuration !== undefined
              ? { appointmentDuration: s.appointmentDuration }
              : {}),
            ...(s.gracePeriod !== undefined
              ? { gracePeriod: s.gracePeriod }
              : {}),
            ...(s.delayThreshold !== undefined
              ? { delayThreshold: s.delayThreshold }
              : {}),
          },
        },
      },
      select: clinicSelect,
    });

    const user = await tx.user.create({
      data: {
        clinicId: clinic.id,
        email: input.doctor.email,
        passwordHash,
        fullName: input.doctor.fullName,
        role: "DOCTOR",
      },
      select: { id: true },
    });

    const doctor = await tx.doctor.create({
      data: {
        clinicId: clinic.id,
        userId: user.id,
        specialty: input.doctor.specialty,
        bio: input.doctor.bio ?? null,
      },
      select: {
        id: true,
        specialty: true,
        bio: true,
        isBookable: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    return { clinic, doctor };
  });

  logger.info("[Admin] clinic created", { adminId, clinicId: clinic.id });

  return {
    clinic,
    doctor,
    credentials: {
      email: input.doctor.email,
      temporaryPassword,
    } satisfies Credentials,
  };
}

// ---------------------------------------------------------------------------
// List clinics (counts only)
// ---------------------------------------------------------------------------

export async function listClinics(query: ListClinicsQuery) {
  const { search, status, page, limit } = query;

  const where: Prisma.ClinicWhereInput = {
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            // find a clinic by one of its staff logins
            {
              users: {
                some: { email: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.clinic.findMany({
      where,
      select: { ...clinicSelect, _count: { select: countsSelect } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.clinic.count({ where }),
  ]);

  return {
    clinics: rows.map(({ _count, ...clinic }) => ({
      ...clinic,
      counts: toCounts(_count),
    })),
    meta: ApiResponse.buildPaginationMeta(total, page, limit),
  };
}

// ---------------------------------------------------------------------------
// Clinic details (settings, staff, counts)
// ---------------------------------------------------------------------------

export async function getClinic(id: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { id },
    select: {
      ...clinicSelect,
      settings: {
        select: {
          workingHours: true,
          maxPatientsPerDay: true,
          appointmentDuration: true,
          gracePeriod: true,
          delayThreshold: true,
          waitingScreenMode: true,
        },
      },
      doctors: {
        select: {
          id: true,
          specialty: true,
          isBookable: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              isActive: true,
              lastLogin: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      users: {
        where: { role: "RECEPTIONIST" },
        select: {
          id: true,
          fullName: true,
          email: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: countsSelect },
    },
  });

  if (!clinic) throw new NotFoundError("Clinic not found");

  const { _count, users, ...rest } = clinic;
  return { ...rest, receptionists: users, counts: toCounts(_count) };
}

// ---------------------------------------------------------------------------
// Update clinic details
// ---------------------------------------------------------------------------

export async function updateClinic(
  id: string,
  input: UpdateClinicInput,
  adminId: string
) {
  await findClinicOrThrow(id);

  if (input.name !== undefined) {
    await assertClinicNameFree(input.name, id);
  }

  const clinic = await prisma.clinic.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    },
    select: clinicSelect,
  });

  logger.info("[Admin] clinic updated", { adminId, clinicId: id });
  return clinic;
}

// ---------------------------------------------------------------------------
// Activate / suspend. A suspended clinic is locked out everywhere at once:
// clinic logins and refresh are refused, authMiddleware rejects its users'
// tokens on the next request, and its public booking / waiting screen close.
// Nothing is deleted.
// ---------------------------------------------------------------------------

export async function setClinicStatus(
  id: string,
  isActive: boolean,
  adminId: string
) {
  await findClinicOrThrow(id);

  const clinic = await prisma.clinic.update({
    where: { id },
    data: { isActive },
    select: clinicSelect,
  });

  logger.info("[Admin] clinic status changed", {
    adminId,
    clinicId: id,
    isActive,
  });
  return clinic;
}

// ---------------------------------------------------------------------------
// Add another doctor to an existing clinic (server-generated password)
// ---------------------------------------------------------------------------

export async function addDoctor(
  clinicId: string,
  input: AddDoctorInput,
  adminId: string
) {
  await findClinicOrThrow(clinicId);

  const temporaryPassword = generatePassword();

  // Same code path the clinic used before: user (DOCTOR) + profile, atomically,
  // and a 409 if the email is already used in this clinic.
  const doctor = await createDoctor(clinicId, {
    ...input,
    password: temporaryPassword,
  });

  logger.info("[Admin] doctor added", {
    adminId,
    clinicId,
    doctorId: doctor.id,
  });

  return {
    doctor,
    credentials: {
      email: input.email,
      temporaryPassword,
    } satisfies Credentials,
  };
}

// ---------------------------------------------------------------------------
// Reset the password of any user of a clinic (doctor or receptionist)
// ---------------------------------------------------------------------------

export async function resetUserPassword(
  clinicId: string,
  userId: string,
  adminId: string
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, clinicId },
    select: { id: true, email: true, fullName: true, role: true },
  });
  if (!user) throw new NotFoundError("User not found in this clinic");

  const temporaryPassword = generatePassword();
  const passwordHash = await bcrypt.hash(
    temporaryPassword,
    config.bcrypt.saltRounds
  );

  // New password + end every existing session of that user, atomically.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info("[Admin] user password reset", {
    adminId,
    clinicId,
    userId: user.id,
  });

  return {
    user,
    credentials: {
      email: user.email,
      temporaryPassword,
    } satisfies Credentials,
  };
}
