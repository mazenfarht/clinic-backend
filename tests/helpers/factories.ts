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
  // Doctor profile id (only for DOCTOR users). Appointments, queue entries and
  // visits are scoped per doctor profile, not per user.
  doctorId?: string;
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
    isClinicAdmin: boolean;
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
      isClinicAdmin: overrides.isClinicAdmin ?? false,
    },
  });

  // A DOCTOR login needs a linked Doctor profile; without it every
  // doctor-scoped endpoint answers 403 ("No doctor profile is linked").
  let doctorId: string | undefined;
  if (user.role === "DOCTOR") {
    const doctor = await prisma.doctor.create({
      data: { clinicId, userId: user.id, specialty: "General Medicine" },
    });
    doctorId = doctor.id;
  }

  return {
    id: user.id,
    clinicId: user.clinicId,
    email: user.email,
    role: user.role,
    plainPassword,
    doctorId,
  };
}

// The access token carries the user's tokenVersion (`tv`); the auth middleware
// rejects the token when it no longer matches the database. New users start at
// tokenVersion 0.
export function signAccessToken(
  user: {
    id: string;
    clinicId: string;
    role: Role;
  },
  tokenVersion = 0
): string {
  return jwt.sign(
    {
      sub: user.id,
      clinicId: user.clinicId,
      role: user.role,
      tv: tokenVersion,
      type: "access",
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
}

export function signExpiredAccessToken(
  user: {
    id: string;
    clinicId: string;
    role: Role;
  },
  tokenVersion = 0
): string {
  return jwt.sign(
    {
      sub: user.id,
      clinicId: user.clinicId,
      role: user.role,
      tv: tokenVersion,
      type: "access",
    },
    config.jwt.secret,
    { expiresIn: -10 } as jwt.SignOptions
  );
}

// Refresh tokens are now tracked server-side: the token's `jti` must point at a
// RefreshToken row, otherwise /auth/refresh answers 401. This creates the row
// and signs the matching JWT.
export async function signRefreshToken(user: {
  id: string;
  clinicId: string;
}): Promise<string> {
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: user.id, clinicId: user.clinicId, type: "refresh" },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn, jwtid: jti } as jwt.SignOptions
  );
  const { exp } = jwt.decode(token) as { exp: number };

  await prisma.refreshToken.create({
    data: { id: jti, userId: user.id, expiresAt: new Date(exp * 1000) },
  });

  return token;
}

// --- Platform admin (super admin) -------------------------------------------

export interface TestPlatformAdmin {
  id: string;
  email: string;
  plainPassword: string;
}

export async function createPlatformAdmin(
  overrides: Partial<{
    email: string;
    fullName: string;
    password: string;
    isActive: boolean;
  }> = {}
): Promise<TestPlatformAdmin> {
  const plainPassword = overrides.password ?? DEFAULT_PASSWORD;
  const admin = await prisma.platformAdmin.create({
    data: {
      email:
        overrides.email ?? `admin-${randomUUID().slice(0, 8)}@example.com`,
      fullName: overrides.fullName ?? "Test Admin",
      passwordHash: await bcrypt.hash(plainPassword, config.bcrypt.saltRounds),
      isActive: overrides.isActive ?? true,
    },
  });
  return { id: admin.id, email: admin.email, plainPassword };
}

export async function deletePlatformAdmin(id: string): Promise<void> {
  await prisma.platformAdmin.delete({ where: { id } }).catch(() => undefined);
}

// Admin tokens are signed with ADMIN_JWT_SECRET and carry the admin's
// tokenVersion (`tv`); new admins start at 0.
export function signAdminToken(adminId: string, tokenVersion = 0): string {
  return jwt.sign(
    { sub: adminId, tv: tokenVersion, type: "admin" },
    config.adminJwt.secret,
    { expiresIn: config.adminJwt.expiresIn } as jwt.SignOptions
  );
}

export function signExpiredAdminToken(adminId: string, tokenVersion = 0): string {
  return jwt.sign(
    { sub: adminId, tv: tokenVersion, type: "admin" },
    config.adminJwt.secret,
    { expiresIn: -10 } as jwt.SignOptions
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

// The n-th (1-based) future date on which the test clinic is OPEN. The clinic
// created by createClinicSettings() is closed on Saturdays, so a plain
// futureDateStr(n) lands on a closed day one week out of seven and makes
// booking tests fail depending on the weekday they run on. Distinct n always
// give distinct dates.
export function futureOpenDateStr(nthOpenDay: number): string {
  const d = new Date();
  let found = 0;
  while (found < nthOpenDay) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 6) found++; // 6 = Saturday (closed in the factory)
  }
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
    doctorId: string | null;
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
      doctorId: overrides.doctorId ?? null,
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
  overrides: Partial<{
    visitDate: Date;
    chiefComplaint: string | null;
    doctorId: string | null;
  }> = {}
) {
  return prisma.visit.create({
    data: {
      clinicId,
      patientId,
      doctorId: overrides.doctorId ?? null,
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