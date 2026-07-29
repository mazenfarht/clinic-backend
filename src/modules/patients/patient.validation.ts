// src/modules/patients/patient.validation.ts

import { z } from "zod";
import { Gender } from "@prisma/client";

const dateOfBirthSchema = z
  .string()
  .trim()
  .min(1, "Date of birth is required")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format")
  .refine((val) => !isNaN(new Date(val).getTime()), {
    message: "Invalid date of birth",
  })
  .refine((val) => new Date(val) < new Date(), {
    message: "Date of birth must be in the past",
  })
  .refine((val) => new Date(val) >= new Date("1900-01-01"), {
    message: "Date of birth must be after 1900-01-01",
  });

export const createPatientSchema = z.object({
  mrn: z
    .string()
    .trim()
    .min(1, "MRN is required")
    .max(50, "MRN must not exceed 50 characters")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "MRN must contain only letters, numbers, hyphens, and underscores"
    ),

  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must not exceed 100 characters"),

  phone: z
    .string()
    .trim()
    .min(7, "Phone number must be at least 7 characters")
    .max(20, "Phone number must not exceed 20 characters")
    .regex(/^\+?[0-9\s\-().]+$/, "Invalid phone number format"),

  dateOfBirth: dateOfBirthSchema,

  gender: z.nativeEnum(Gender),

  address: z
    .string()
    .trim()
    .max(255, "Address must not exceed 255 characters")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must not exceed 1000 characters")
    .optional(),
});

export const updatePatientSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must not exceed 100 characters")
      .optional(),

    phone: z
      .string()
      .trim()
      .min(7, "Phone number must be at least 7 characters")
      .max(20, "Phone number must not exceed 20 characters")
      .regex(/^\+?[0-9\s\-().]+$/, "Invalid phone number format")
      .optional(),

    dateOfBirth: dateOfBirthSchema.optional(),

    gender: z.nativeEnum(Gender).optional(),

    address: z
      .string()
      .trim()
      .max(255, "Address must not exceed 255 characters")
      .nullable()
      .optional(),

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

export const patientQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, "Search term must not exceed 100 characters")
    .optional(),

  gender: z.nativeEnum(Gender).optional(),

  includeDeleted: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),

  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const patientIdSchema = z.object({
  id: z.string().uuid("Invalid patient ID format"),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientQueryInput = z.infer<typeof patientQuerySchema>;
