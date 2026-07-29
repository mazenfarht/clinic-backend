// src/modules/appointments/appointment.validation.ts

import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";

const appointmentDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, "Invalid date")
  .refine((val) => {
    const date = new Date(val);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }, "Appointment date cannot be in the past");

const appointmentTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format");

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
  appointmentDate: appointmentDateSchema,
  appointmentTime: appointmentTimeSchema,
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must not exceed 1000 characters")
    .optional(),
});

export const updateAppointmentSchema = z
  .object({
    appointmentDate: appointmentDateSchema.optional(),
    appointmentTime: appointmentTimeSchema.optional(),
    notes: z
      .string()
      .trim()
      .max(1000, "Notes must not exceed 1000 characters")
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const appointmentQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, "Search term must not exceed 100 characters")
    .optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  patientId: z.string().uuid("Invalid patient ID format").optional(),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional(),
  fromDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "From date must be in YYYY-MM-DD format")
    .optional(),
  toDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "To date must be in YYYY-MM-DD format")
    .optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1, "Page must be at least 1")),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit must be at least 1")
        .max(100, "Limit must not exceed 100")
    ),
});

export const appointmentIdSchema = z.object({
  id: z.string().uuid("Invalid appointment ID format"),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type AppointmentQueryInput = z.infer<typeof appointmentQuerySchema>;
