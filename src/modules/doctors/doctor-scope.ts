// src/modules/doctors/doctor-scope.ts
//
// Central place for the "who can see which doctor's data" rules:
//
//   RECEPTIONIST -> sees every doctor's appointments / queues / visits and may
//                   pass ?doctorId= to narrow down (or to route a patient).
//   DOCTOR       -> locked to their OWN doctor profile. Everything is filtered
//                   by it, and asking for another doctor's data is rejected.

import type { Request } from "express";
import prisma from "../../config/database";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/AppError";

function userOf(req: Request) {
  if (!req.user) throw new UnauthorizedError("Authentication required");
  return req.user;
}

/** The Doctor profile id linked to a DOCTOR login. */
export async function getOwnDoctorId(
  userId: string,
  clinicId: string
): Promise<string> {
  const doctor = await prisma.doctor.findFirst({
    where: { userId, clinicId },
    select: { id: true },
  });

  if (!doctor) {
    throw new ForbiddenError(
      "No doctor profile is linked to this account. Ask the clinic admin to create one."
    );
  }

  return doctor.id;
}

/**
 * For DOCTOR logins: their own doctor id (use it as a hard filter).
 * For everyone else: undefined (no restriction).
 */
export async function getLockedDoctorId(
  req: Request
): Promise<string | undefined> {
  const user = userOf(req);
  if (user.role !== "DOCTOR") return undefined;
  return getOwnDoctorId(user.sub, user.clinicId);
}

/**
 * Resolves which doctor a list / create / call-next operation applies to.
 *
 *  - DOCTOR: always their own id. Requesting a different doctor -> 403.
 *  - RECEPTIONIST: the requested doctor (verified to belong to the clinic),
 *    or undefined when no doctor was requested.
 */
export async function resolveDoctorId(
  req: Request,
  requestedDoctorId?: string
): Promise<string | undefined> {
  const user = userOf(req);

  if (user.role === "DOCTOR") {
    const own = await getOwnDoctorId(user.sub, user.clinicId);
    if (requestedDoctorId && requestedDoctorId !== own) {
      throw new ForbiddenError("You can only access your own patients");
    }
    return own;
  }

  if (!requestedDoctorId) return undefined;

  const doctor = await prisma.doctor.findFirst({
    where: { id: requestedDoctorId, clinicId: user.clinicId },
    select: { id: true },
  });
  if (!doctor) throw new NotFoundError("Doctor not found");

  return doctor.id;
}

// ---------------------------------------------------------------------------
// By-id access checks (call before operating on a single record).
// A doctor asking for someone else's record gets 404, not 403, so ids of other
// doctors' patients are not even confirmed to exist.
// ---------------------------------------------------------------------------

export async function assertQueueEntryAccess(
  req: Request,
  entryId: string
): Promise<void> {
  const lockedDoctorId = await getLockedDoctorId(req);
  if (!lockedDoctorId) return;

  const entry = await prisma.queueEntry.findFirst({
    where: {
      id: entryId,
      clinicId: userOf(req).clinicId,
      doctorId: lockedDoctorId,
    },
    select: { id: true },
  });
  if (!entry) throw new NotFoundError("Queue entry not found");
}

export async function assertAppointmentAccess(
  req: Request,
  appointmentId: string
): Promise<void> {
  const lockedDoctorId = await getLockedDoctorId(req);
  if (!lockedDoctorId) return;

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      clinicId: userOf(req).clinicId,
      doctorId: lockedDoctorId,
    },
    select: { id: true },
  });
  if (!appointment) throw new NotFoundError("Appointment not found");
}

export async function assertVisitAccess(
  req: Request,
  visitId: string
): Promise<void> {
  const lockedDoctorId = await getLockedDoctorId(req);
  if (!lockedDoctorId) return;

  const visit = await prisma.visit.findFirst({
    where: {
      id: visitId,
      clinicId: userOf(req).clinicId,
      doctorId: lockedDoctorId,
    },
    select: { id: true },
  });
  if (!visit) throw new NotFoundError("Visit not found");
}
