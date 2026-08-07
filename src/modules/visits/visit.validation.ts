// src/modules/visits/visit.validation.ts

import { z } from "zod";

export const createVisitSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
  appointmentId: z.string().uuid("Invalid appointment ID format").optional(),
  queueEntryId: z.string().uuid("Invalid queue entry ID format").optional(),
  visitDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Visit date must be in YYYY-MM-DD format")
    .refine((val) => !isNaN(new Date(val).getTime()), "Invalid visit date")
    .optional(),
  chiefComplaint: z
    .string()
    .trim()
    .min(1, "Chief complaint cannot be empty")
    .max(500, "Chief complaint must not exceed 500 characters")
    .optional(),
  diagnosis: z
    .string()
    .trim()
    .min(1, "Diagnosis cannot be empty")
    .max(1000, "Diagnosis must not exceed 1000 characters")
    .optional(),
  treatment: z
    .string()
    .trim()
    .min(1, "Treatment cannot be empty")
    .max(1000, "Treatment must not exceed 1000 characters")
    .optional(),
  prescription: z
    .string()
    .trim()
    .min(1, "Prescription cannot be empty")
    .max(1000, "Prescription must not exceed 1000 characters")
    .optional(),
  notes: z
    .string()
    .trim()
    .min(1, "Notes cannot be empty")
    .max(1000, "Notes must not exceed 1000 characters")
    .optional(),
});

export const updateVisitSchema = z
  .object({
    chiefComplaint: z
      .string()
      .trim()
      .min(1, "Chief complaint cannot be empty")
      .max(500, "Chief complaint must not exceed 500 characters")
      .nullable()
      .optional(),
    diagnosis: z
      .string()
      .trim()
      .min(1, "Diagnosis cannot be empty")
      .max(1000, "Diagnosis must not exceed 1000 characters")
      .nullable()
      .optional(),
    treatment: z
      .string()
      .trim()
      .min(1, "Treatment cannot be empty")
      .max(1000, "Treatment must not exceed 1000 characters")
      .nullable()
      .optional(),
    prescription: z
      .string()
      .trim()
      .min(1, "Prescription cannot be empty")
      .max(1000, "Prescription must not exceed 1000 characters")
      .nullable()
      .optional(),
    notes: z
      .string()
      .trim()
      .min(1, "Notes cannot be empty")
      .max(1000, "Notes must not exceed 1000 characters")
      .nullable()
      .optional(),
    followUpDate: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Follow-up date must be in YYYY-MM-DD format"
      )
      .refine(
        (val) => new Date(val) > new Date(new Date().setUTCHours(0, 0, 0, 0)),
        "Follow-up date must be in the future"
      )
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const visitQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, "Search term must not exceed 100 characters")
    .optional(),
  patientId: z.string().uuid("Invalid patient ID format").optional(),
  createdById: z.string().uuid("Invalid doctor ID format").optional(),
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
  sortBy: z.enum(["visitDate", "createdAt"]).default("visitDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
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

export const visitIdSchema = z.object({
  id: z.string().uuid("Invalid visit ID format"),
});

export const patientIdParamSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
});

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;
export type VisitQueryInput = z.infer<typeof visitQuerySchema>;