// src/modules/doctors/doctors.validation.ts

import { z } from "zod";
import { passwordComplexitySchema } from "../auth/auth.validation";
import { workingHoursSchema } from "../clinic-settings/clinic-settings.validation";

const specialty = z
  .string()
  .trim()
  .min(2, "Specialty must be at least 2 characters")
  .max(100, "Specialty must not exceed 100 characters");

const bio = z.string().trim().max(1000, "Bio must not exceed 1000 characters");

const appointmentDuration = z
  .number()
  .int()
  .min(5, "Appointment duration must be at least 5 minutes")
  .max(240, "Appointment duration must not exceed 240 minutes");

// POST /doctors — creates the login account AND the doctor profile together
export const createDoctorSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: passwordComplexitySchema,
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be at most 100 characters"),
  specialty,
  bio: bio.optional(),
  appointmentDuration: appointmentDuration.optional(),
  workingHours: workingHoursSchema.optional(),
  isBookable: z.boolean().optional(),
});

// PATCH /doctors/:id — null clears an override (falls back to clinic settings)
export const updateDoctorSchema = z
  .object({
    specialty: specialty.optional(),
    bio: bio.nullable().optional(),
    appointmentDuration: appointmentDuration.nullable().optional(),
    workingHours: workingHoursSchema.nullable().optional(),
    isBookable: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided for update",
  });

export const doctorIdSchema = z.object({
  id: z.string().uuid("Invalid doctor ID format"),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
