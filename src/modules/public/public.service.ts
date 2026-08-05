// src/modules/public/public.service.ts

import prisma from "../../config/database";
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

function generateSlots(open: string, close: string): string[] {
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
    current += 30;
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

function parseDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
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
        select: { workingHours: true },
      },
    },
  });
  if (!clinic) throw new NotFoundError("Clinic not found");
  return clinic;
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
  date: Date
): Promise<Set<string>> {
  const booked = await prisma.appointment.findMany({
    where: {
      clinicId,
      appointmentDate: date,
      status: { not: "CANCELLED" },
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

// Generates the next MRN for a clinic in the format MRN-000001
async function generateMrn(clinicId: string): Promise<string> {
  const count = await prisma.patient.count({ where: { clinicId } });
  const next = (count + 1).toString().padStart(6, "0");
  return `MRN-${next}`;
}

// ---------------------------------------------------------------------------
// GET /public/clinics/:clinicId/availability
// ---------------------------------------------------------------------------

export async function getAvailability(
  clinicId: string,
  date: string
): Promise<{
  date: string;
  isOpen: boolean;
  availableSlots: string[];
}> {
  const clinic = await findActiveClinicWithSettings(clinicId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestedDate = parseDateOnly(date);

  if (requestedDate < today) {
    throw new BadRequestError("Cannot check availability for a past date");
  }

  const workingHours = (clinic.settings?.workingHours ??
    {}) as unknown as Record<DayKey, DaySchedule>;
  const dayKey = DAY_KEYS[requestedDate.getUTCDay()];
  const daySchedule = workingHours[dayKey];

  if (!daySchedule || !daySchedule.isOpen) {
    return { date, isOpen: false, availableSlots: [] };
  }

  const allSlots = generateSlots(daySchedule.open, daySchedule.close);
  const bookedTimes = await getBookedSlots(clinicId, requestedDate);
  const availableSlots = allSlots.filter((slot) => !bookedTimes.has(slot));

  return { date, isOpen: true, availableSlots };
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
  return { exists: true, patientId: patient.id, fullName: patient.fullName };
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

  // Auto-generate MRN — retry once on the rare collision chance
  let mrn = await generateMrn(clinicId);
  const mrnConflict = await prisma.patient.findFirst({
    where: { clinicId, mrn },
    select: { id: true },
  });
  if (mrnConflict) {
    mrn = `MRN-${Date.now()}`;
  }

  const patient = await prisma.patient.create({
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

  return { patientId: patient.id, fullName: patient.fullName };
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
}> {
  const clinic = await findActiveClinicWithSettings(clinicId);

  // 1. Validate date is not in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const appointmentDate = parseDateOnly(input.appointmentDate);

  if (appointmentDate < today) {
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
  const workingHours = (clinic.settings?.workingHours ??
    {}) as unknown as Record<DayKey, DaySchedule>;
  const daySchedule = resolveDaySchedule(workingHours, appointmentDate);
  const allSlots = generateSlots(daySchedule.open, daySchedule.close);

  if (!allSlots.includes(input.appointmentTime)) {
    throw new BadRequestError(
      "The selected time slot is outside the clinic's working hours"
    );
  }

  // 4. Check if patient already has an appointment on this date
  const existingPatientAppointment = await prisma.appointment.findFirst({
    where: {
      clinicId,
      patientId: input.patientId,
      appointmentDate,
      status: "SCHEDULED",
    },
    select: { id: true },
  });

  if (existingPatientAppointment) {
    throw new ConflictError("Patient already has an appointment on this date");
  }

  // 5. Check slot is not already booked
  const bookedTimes = await getBookedSlots(
    clinicId,
    new Date(input.appointmentDate)
  );
  if (bookedTimes.has(input.appointmentTime)) {
    throw new ConflictError(
      `An appointment already exists at ${input.appointmentTime} on ${input.appointmentDate}`
    );
  }

  // 6. Create the appointment — the DB unique constraint is the final guard
  const [h, m] = input.appointmentTime.split(":").map(Number);
  const appointmentTime = new Date(0);
  appointmentTime.setUTCHours(h, m, 0, 0);

  const appointment = await prisma.appointment.create({
    data: {
      clinicId,
      patientId: input.patientId,
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
  };
}
