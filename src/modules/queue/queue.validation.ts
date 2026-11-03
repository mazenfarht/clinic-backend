// src/modules/queue/queue.validation.ts

import { z } from "zod";
import { QueueStatus } from "@prisma/client";

const doctorIdField = z.string().uuid("Invalid doctor ID format");

export const checkInSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
  // Which doctor's queue to join. Optional when the appointment already has a
  // doctor, and ignored for DOCTOR logins (they always use their own queue).
  doctorId: doctorIdField.optional(),
  appointmentId: z.string().uuid("Invalid appointment ID format").optional(),
  chiefComplaint: z
    .string()
    .trim()
    .max(500, "Chief complaint must not exceed 500 characters")
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must not exceed 1000 characters")
    .optional(),
});

export const reserveSlotSchema = z.object({
  doctorId: doctorIdField.optional(),
  reservedFor: z
    .string()
    .trim()
    .min(1, "Reserved for name is required")
    .max(100, "Reserved for name must not exceed 100 characters"),
  queueNumber: z
    .number()
    .int("Queue number must be an integer")
    .min(1, "Queue number must be at least 1")
    .max(3, "Only the first 3 queue numbers can be manually reserved"),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must not exceed 1000 characters")
    .optional(),
});

export const queueQuerySchema = z.object({
  status: z.nativeEnum(QueueStatus).optional(),
  doctorId: doctorIdField.optional(),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1, "Page must be at least 1")),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit must be at least 1")
        .max(100, "Limit must not exceed 100")
    ),
});

export const queueEntryIdSchema = z.object({
  id: z.string().uuid("Invalid queue entry ID format"),
});

// Body / query that only carries an optional doctor (call-next, reset, status, statistics)
export const doctorScopeSchema = z.object({
  doctorId: doctorIdField.optional(),
});

export const queueStatisticsQuerySchema = z.object({
  doctorId: doctorIdField.optional(),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional(),
});

export const recallSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must not exceed 1000 characters")
    .optional(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type ReserveSlotInput = z.infer<typeof reserveSlotSchema>;
export type QueueQueryInput = z.infer<typeof queueQuerySchema>;
export type RecallInput = z.infer<typeof recallSchema>;
