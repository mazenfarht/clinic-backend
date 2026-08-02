// src/modules/public/public.validation.ts

import { z } from "zod";
import { Gender } from "@prisma/client";

export const clinicIdParamSchema = z.object({
  clinicId: z.string().uuid("Invalid clinic ID format"),
});

export const availabilityQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((val) => !isNaN(new Date(val).getTime()), {
      message: "Invalid date",
    }),
});

export const patientLookupSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7, "Phone number must be at least 7 characters")
    .max(20, "Phone number must not exceed 20 characters")
    .regex(/^\+?[0-9\s\-().]+$/, "Invalid phone number format"),
});

export const publicRegisterPatientSchema = z.object({
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

  dateOfBirth: z
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
    }),

  gender: z.nativeEnum(Gender),
});

export const publicBookAppointmentSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),

  appointmentDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((val) => !isNaN(new Date(val).getTime()), {
      message: "Invalid appointment date",
    }),

  appointmentTime: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must not exceed 1000 characters")
    .optional(),
});

export type ClinicIdParam = z.infer<typeof clinicIdParamSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type PatientLookupInput = z.infer<typeof patientLookupSchema>;
export type PublicRegisterPatientInput = z.infer<
  typeof publicRegisterPatientSchema
>;
export type PublicBookAppointmentInput = z.infer<
  typeof publicBookAppointmentSchema
>;
