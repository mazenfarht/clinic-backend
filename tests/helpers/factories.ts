import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "./prisma";
import config from "../../src/config";
import type { Role, Gender } from "@prisma/client";

export const DEFAULT_PASSWORD = "Str0ng!Passw0rd";

export interface TestClinic {
  id: string;
  name: string;
}

export interface TestUser {
  id: string;
  clinicId: string;
  email: string;
  role: Role;
  plainPassword: string;
}

export async function createClinic(
  overrides: Partial<{ name: string; isActive: boolean }> = {}
): Promise<TestClinic> {
  const clinic = await prisma.clinic.create({
    data: {
      name: overrides.name ?? `Test Clinic ${randomUUID().slice(0, 8)}`,
      isActive: overrides.isActive ?? true,
    },
  });
  return { id: clinic.id, name: clinic.name };
}

export async function deleteClinicCascade(clinicId: string): Promise<void> {
  await prisma.clinic
    .delete({ where: { id: clinicId } })
    .catch(() => undefined);
}

export async function createUser(
  clinicId: string,
  role: Role,
  overrides: Partial<{
    email: string;
    fullName: string;
    password: string;
    isActive: boolean;
  }> = {}
): Promise<TestUser> {
  const plainPassword = overrides.password ?? DEFAULT_PASSWORD;
  const passwordHash = await bcrypt.hash(
    plainPassword,
    config.bcrypt.saltRounds
  );

  const user = await prisma.user.create({
    data: {
      clinicId,
      email: overrides.email ?? `user-${randomUUID().slice(0, 8)}@example.com`,
      fullName: overrides.fullName ?? "Test User",
      role,
      passwordHash,
      isActive: overrides.isActive ?? true,
    },
  });

  return {
    id: user.id,
    clinicId: user.clinicId,
    email: user.email,
    role: user.role,
    plainPassword,
  };
}

export function signAccessToken(user: {
  id: string;
  clinicId: string;
  role: Role;
}): string {
  return jwt.sign(
    { sub: user.id, clinicId: user.clinicId, role: user.role, type: "access" },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
}

export function signExpiredAccessToken(user: {
  id: string;
  clinicId: string;
  role: Role;
}): string {
  return jwt.sign(
    { sub: user.id, clinicId: user.clinicId, role: user.role, type: "access" },
    config.jwt.secret,
    { expiresIn: -10 } as jwt.SignOptions
  );
}

export function signRefreshToken(user: {
  id: string;
  clinicId: string;
}): string {
  return jwt.sign(
    { sub: user.id, clinicId: user.clinicId, type: "refresh" },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions
  );
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export function isoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function todayDateOnly(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function futureDateStr(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return isoDate(d);
}

export async function createPatient(
  clinicId: string,
  createdById: string,
  overrides: Partial<{
    mrn: string;
    fullName: string;
    phone: string;
    dateOfBirth: string;
    gender: Gender;
    deletedAt: Date | null;
  }> = {}
) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.patient.create({
    data: {
      clinicId,
      createdById,
      updatedById: createdById,
      mrn: overrides.mrn ?? `MRN-${suffix}`,
      fullName: overrides.fullName ?? "Jane Doe",
      phone:
        overrides.phone ?? `+100${suffix.replace(/\D/g, "").padEnd(7, "1")}`,
      dateOfBirth: new Date(overrides.dateOfBirth ?? "1990-01-01"),
      gender: overrides.gender ?? ("FEMALE" as Gender),
      deletedAt: overrides.deletedAt ?? null,
    },
  });
}

export async function createAppointment(
  clinicId: string,
  patientId: string,
  createdById: string,
  overrides: Partial<{
    appointmentDate: string;
    appointmentTime: string;
    status: string;
    notes: string | null;
  }> = {}
) {
  const dateStr = overrides.appointmentDate ?? futureDateStr(1);
  const timeStr = overrides.appointmentTime ?? "09:00";
  const dateTime = new Date(`${dateStr}T${timeStr}:00.000Z`);

  return prisma.appointment.create({
    data: {
      clinicId,
      patientId,
      createdById,
      updatedById: createdById,
      appointmentDate: dateTime,
      appointmentTime: dateTime,
      status: (overrides.status as any) ?? "SCHEDULED",
      notes: overrides.notes ?? null,
    },
  });
}

export async function createVisit(
  clinicId: string,
  patientId: string,
  createdById: string,
  overrides: Partial<{ visitDate: Date; chiefComplaint: string | null }> = {}
) {
  return prisma.visit.create({
    data: {
      clinicId,
      patientId,
      createdById,
      updatedById: createdById,
      visitDate: overrides.visitDate ?? todayDateOnly(),
      chiefComplaint: overrides.chiefComplaint ?? "Headache",
    },
  });
}

export async function createClinicSettings(
  clinicId: string,
  overrides: Partial<{ maxPatientsPerDay: number }> = {}
) {
  const fullDaySchedule = { open: "09:00", close: "17:00", isOpen: true };
  const closedDaySchedule = { open: "09:00", close: "14:00", isOpen: false };

  return prisma.clinicSettings.create({
    data: {
      clinicId,
      workingHours: {
        sunday: fullDaySchedule,
        monday: fullDaySchedule,
        tuesday: fullDaySchedule,
        wednesday: fullDaySchedule,
        thursday: fullDaySchedule,
        friday: fullDaySchedule,
        saturday: closedDaySchedule,
      },
      maxPatientsPerDay: overrides.maxPatientsPerDay ?? 50,
      appointmentDuration: 30,
      gracePeriod: 15,
      delayThreshold: 20,
    },
  });
}
