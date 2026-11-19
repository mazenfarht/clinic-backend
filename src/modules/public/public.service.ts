// src/modules/public/public.service.ts

import { Prisma } from "@prisma/client";
import prisma from "../../config/database";
import { getClinicNow } from "../../shared/utils/clinicTime";
import { allocateMrn } from "../patients/mrn";
import { maskName } from "../../shared/utils/maskName";
import { parseCalendarDate } from "../../shared/utils/calendarDate";
import { getWaitingBoard } from "../queue/queue.service";
import type { WaitingBoard } from "../queue/queue.types";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../shared/errors/AppError";
import type {
  PublicRegisterPatientInput,
  PublicBookAppointmentInput,
} from "./public.validation";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function generateSlots(
  open: string,
  close: string,
  durationMinutes: number
): string[] {
  const slots: string[] = [];
  const [openH, openM] = open.split(":").map(Number);
  const [closeH, closeM] = close.split(":").map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;
  while (current < end) {
    const h = Math.floor(current / 60)
      .toString()
      .padStart(2, "0");
    const m = (current % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    current += durationMinutes;
  }
  return slots;
}

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type DayKey = (typeof DAY_KEYS)[number];

// Active appointments hold their slot. Mirrors the partial unique index
// (SCHEDULED, CONFIRMED) defined in the migrations.
const ACTIVE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;

function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

function parseDateOnly(date: string): Date {
  // Rejects impossible dates such as 2026-02-31 instead of rolling them over.
  const parsed = parseCalendarDate(date);
  if (!parsed) {
    throw new BadRequestError("Invalid date");
  }
  return parsed;
}

interface DaySchedule {
  open: string;
  close: string;
  isOpen: boolean;
}

// Fetches clinic with settings, throws if not found or inactive
async function findActiveClinicWithSettings(clinicId: string) {
  const clinic = await prisma.clinic.findFirst({
    where: { id: clinicId, isActive: true },
    select: {
      id: true,
      settings: {
        select: {
          workingHours: true,
          appointmentDuration: true,
          maxPatientsPerDay: true,
        },
      },
    },
  });
  if (!clinic) throw new NotFoundError("Clinic not found");
  return clinic;
}

// A doctor can be booked online only if: same clinic, flagged bookable, and the
// login account is active. Per-doctor hours/duration override clinic defaults.
async function findBookableDoctor(
  clinicId: string,
  doctorId: string,
  clinicSettings: {
    workingHours: unknown;
    appointmentDuration: number;
    maxPatientsPerDay: number;
  } | null
) {
  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      clinicId,
      isBookable: true,
      user: { isActive: true },
    },
    select: {
      id: true,
      specialty: true,
      workingHours: true,
      appointmentDuration: true,
      user: { select: { fullName: true } },
    },
  });
  if (!doctor) throw new NotFoundError("Doctor not found or not available");

  return {
    id: doctor.id,
    fullName: doctor.user.fullName,
    specialty: doctor.specialty,
    workingHours: (doctor.workingHours ??
      clinicSettings?.workingHours ??
      {}) as unknown as Record<DayKey, DaySchedule>,
    duration:
      doctor.appointmentDuration ?? clinicSettings?.appointmentDuration ?? 30,
    maxPerDay: clinicSettings?.maxPatientsPerDay ?? Infinity,
  };
}

// Resolves working hours for a given date; throws if clinic is closed that day
function resolveDaySchedule(
  workingHours: Record<DayKey, DaySchedule>,
  date: Date
): DaySchedule {
  const dayKey = DAY_KEYS[date.getUTCDay()];
  const schedule = workingHours[dayKey];
  if (!schedule || !schedule.isOpen) {
    throw new BadRequestError("The clinic is closed on the selected date");
  }
  return schedule;
}

// Returns the Set of already-booked HH:MM strings for a clinic/date
async function getBookedSlots(
  clinicId: string,
  doctorId: string,
  date: Date
): Promise<Set<string>> {
  const booked = await prisma.appointment.findMany({
    where: {
      clinicId,
      doctorId,
      appointmentDate: date,
      status: { in: [...ACTIVE_STATUSES] },
    },
    select: { appointmentTime: true },
  });
  return new Set(
    booked.map((a) => {
      const t = new Date(a.appointmentTime);
      const h = t.getUTCHours().toString().padStart(2, "0");
      const m = t.getUTCMinutes().toString().padStart(2, "0");
      return `${h}:${m}`;
    })
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// GET /public/clinics/:clinicId/availability
// ---------------------------------------------------------------------------

export async function getAvailability(
  clinicId: string,
  doctorId: string,
  date: string
): Promise<{
  doctorId: string;
  date: string;
  isOpen: boolean;
  availableSlots: string[];
}> {
  const clinic = await findActiveClinicWithSettings(clinicId);

  const now = getClinicNow();
  const requestedDate = parseDateOnly(date);

  if (date < now.dateStr) {
    throw new BadRequestError("Cannot check availability for a past date");
  }

  const doctor = await findBookableDoctor(clinicId, doctorId, clinic.settings);
  const dayKey = DAY_KEYS[requestedDate.getUTCDay()];
  const daySchedule = doctor.workingHours[dayKey];

  if (!daySchedule || !daySchedule.isOpen) {
    return { doctorId, date, isOpen: false, availableSlots: [] };
  }

  const allSlots = generateSlots(
    daySchedule.open,
    daySchedule.close,
    doctor.duration
  );
  const bookedTimes = await getBookedSlots(clinicId, doctorId, requestedDate);

  // maxPatientsPerDay is applied per doctor
  const dayIsFull = bookedTimes.size >= doctor.maxPerDay;

  const availableSlots = dayIsFull
    ? []
    : allSlots.filter(
        (slot) =>
          !bookedTimes.has(slot) &&
          // hide slots that already passed today
          !(date === now.dateStr && slotToMinutes(slot) <= now.minutes)
      );

  return { doctorId, date, isOpen: true, availableSlots };
}

// ---------------------------------------------------------------------------
// POST /public/clinics/:clinicId/patients/lookup
// ---------------------------------------------------------------------------

export async function lookupPatientByPhone(
  clinicId: string,
  phone: string
): Promise<{
  exists: boolean;
  patientId: string | null;
  fullName: string | null;
}> {
  const clinic = await prisma.clinic.findFirst({
    where: { id: clinicId, isActive: true },
    select: { id: true },
  });
  if (!clinic) throw new NotFoundError("Clinic not found");

  const patient = await prisma.patient.findFirst({
    where: { clinicId, phone, deletedAt: null },
    select: { id: true, fullName: true },
  });

  if (!patient) return { exists: false, patientId: null, fullName: null };
  return {
    exists: true,
    patientId: patient.id,
    fullName: maskName(patient.fullName),
  };
}

// ---------------------------------------------------------------------------
// POST /public/clinics/:clinicId/patients/register
// ---------------------------------------------------------------------------

export async function registerPatient(
  clinicId: string,
  input: PublicRegisterPatientInput
): Promise<{
  patientId: string;
  fullName: string;
}> {
  await findActiveClinicWithSettings(clinicId);

  // Check phone uniqueness within clinic
  const existing = await prisma.patient.findFirst({
    where: { clinicId, phone: input.phone },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      `A patient with phone "${input.phone}" already exists in this clinic`
    );
  }

  // The MRN comes from the clinic's own sequence (same one staff use), reserved
  // inside the transaction that inserts the patient.
  try {
    const patient = await prisma.$transaction(async (tx) => {
      const mrn = await allocateMrn(tx, clinicId);
      return tx.patient.create({
        data: {
          clinicId,
          mrn,
          fullName: input.fullName,
          phone: input.phone,
          dateOfBirth: new Date(input.dateOfBirth),
          gender: input.gender,
        },
        select: { id: true, fullName: true },
      });
    });
    return { patientId: patient.id, fullName: patient.fullName };
  } catch (err) {
    // Two registrations with the same phone at the same moment: the unique
    // index let only one through.
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        `A patient with phone "${input.phone}" already exists in this clinic`
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST /public/clinics/:clinicId/appointments
// ---------------------------------------------------------------------------

export async function bookAppointment(
  clinicId: string,
  input: PublicBookAppointmentInput
): Promise<{
  appointmentId: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  patient: { fullName: string };
  doctor: { id: string; fullName: string; specialty: string };
}> {
  const clinic = await findActiveClinicWithSettings(clinicId);

  // 1. Validate date is not in the past
  const now = getClinicNow();
  const appointmentDate = parseDateOnly(input.appointmentDate);

  if (input.appointmentDate < now.dateStr) {
    throw new BadRequestError("Appointment date cannot be in the past");
  }

  // 2. Validate patient exists, belongs to this clinic, and is not deleted
  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, clinicId, deletedAt: null },
    select: { id: true, fullName: true },
  });
  if (!patient) {
    throw new NotFoundError("Patient not found or has been deleted");
  }

  // 3. Validate time slot is within clinic working hours
  const doctor = await findBookableDoctor(
    clinicId,
    input.doctorId,
    clinic.settings
  );
  const daySchedule = resolveDaySchedule(doctor.workingHours, appointmentDate);
  const allSlots = generateSlots(
    daySchedule.open,
    daySchedule.close,
    doctor.duration
  );

  if (!allSlots.includes(input.appointmentTime)) {
    throw new BadRequestError(
      "The selected time slot is outside the clinic's working hours"
    );
  }

  if (
    input.appointmentDate === now.dateStr &&
    slotToMinutes(input.appointmentTime) <= now.minutes
  ) {
    throw new BadRequestError("The selected time slot has already passed");
  }

  // 4. Check if patient already has an appointment on this date
  const existingPatientAppointment = await prisma.appointment.findFirst({
    where: {
      clinicId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      appointmentDate,
      status: { in: [...ACTIVE_STATUSES] },
    },
    select: { id: true },
  });

  if (existingPatientAppointment) {
    throw new ConflictError(
      "Patient already has an appointment with this doctor on this date"
    );
  }

  // 5. Check slot is not already booked
  const bookedTimes = await getBookedSlots(
    clinicId,
    input.doctorId,
    appointmentDate
  );
  if (bookedTimes.has(input.appointmentTime)) {
    throw new ConflictError(
      `An appointment already exists at ${input.appointmentTime} on ${input.appointmentDate}`
    );
  }

  // 5b. Respect the clinic's daily capacity
  if (bookedTimes.size >= doctor.maxPerDay) {
    throw new ConflictError("This doctor is fully booked on this date");
  }

  // 6. Create the appointment — the DB unique constraint is the final guard
  const [h, m] = input.appointmentTime.split(":").map(Number);
  const appointmentTime = new Date(0);
  appointmentTime.setUTCHours(h, m, 0, 0);

  let appointment;
  try {
    appointment = await prisma.appointment.create({
      data: {
        clinicId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        appointmentDate,
        appointmentTime,
        notes: input.notes ?? null,
      },
      select: {
        id: true,
        appointmentDate: true,
        appointmentTime: true,
        status: true,
        patient: { select: { fullName: true } },
      },
    });
  } catch (err) {
    // Two people grabbed the same slot at once — the partial unique index won.
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        `An appointment already exists at ${input.appointmentTime} on ${input.appointmentDate}`
      );
    }
    throw err;
  }

  const resTime = new Date(appointment.appointmentTime);
  const formattedTime = `${resTime
    .getUTCHours()
    .toString()
    .padStart(2, "0")}:${resTime.getUTCMinutes().toString().padStart(2, "0")}`;
  const formattedDate = appointment.appointmentDate.toISOString().split("T")[0];

  return {
    appointmentId: appointment.id,
    appointmentDate: formattedDate,
    appointmentTime: formattedTime,
    status: appointment.status,
    patient: { fullName: appointment.patient.fullName },
    doctor: {
      id: doctor.id,
      fullName: doctor.fullName,
      specialty: doctor.specialty,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /public/clinics/:clinicId/doctors
// ---------------------------------------------------------------------------

export async function listBookableDoctors(clinicId: string) {
  await findActiveClinicWithSettings(clinicId);

  const doctors = await prisma.doctor.findMany({
    where: { clinicId, isBookable: true, user: { isActive: true } },
    select: {
      id: true,
      specialty: true,
      bio: true,
      user: { select: { fullName: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  return doctors.map((d) => ({
    id: d.id,
    fullName: d.user.fullName,
    specialty: d.specialty,
    bio: d.bio,
  }));
}

// ---------------------------------------------------------------------------
// GET /public/clinics/:clinicId/waiting-screen
// Public waiting-room display: queue numbers per doctor (and masked names when
// the clinic enabled waitingScreenMode = NAMES). Never exposes phone / MRN.
// ---------------------------------------------------------------------------

export async function getWaitingScreen(
  clinicId: string,
  doctorId?: string
): Promise<WaitingBoard> {
  await findActiveClinicWithSettings(clinicId);
  return getWaitingBoard(clinicId, doctorId);
}
