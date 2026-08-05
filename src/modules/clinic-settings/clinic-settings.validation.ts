// src/modules/clinic-settings/clinic-settings.validation.ts

import { z } from "zod";

const workingHoursDaySchema = z.object({
  open: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Open time must be in HH:MM format"),
  close: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Close time must be in HH:MM format"),
  isOpen: z.boolean(),
});

const workingHoursSchema = z.object({
  monday: workingHoursDaySchema,
  tuesday: workingHoursDaySchema,
  wednesday: workingHoursDaySchema,
  thursday: workingHoursDaySchema,
  friday: workingHoursDaySchema,
  saturday: workingHoursDaySchema,
  sunday: workingHoursDaySchema,
});

export const updateClinicSettingsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Clinic name must be at least 2 characters")
      .max(100, "Clinic name must not exceed 100 characters")
      .optional(),
    phone: z
      .string()
      .trim()
      .min(7, "Phone number must be at least 7 characters")
      .max(20, "Phone number must not exceed 20 characters")
      .regex(/^\+?[0-9\s\-().]+$/, "Invalid phone number format")
      .nullable()
      .optional(),
    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .max(100, "Email must not exceed 100 characters")
      .nullable()
      .optional(),
    address: z
      .string()
      .trim()
      .min(1, "Address cannot be empty")
      .max(255, "Address must not exceed 255 characters")
      .nullable()
      .optional(),
    workingHours: workingHoursSchema.optional(),
    maxPatientsPerDay: z
      .number()
      .int("Max patients per day must be an integer")
      .min(1, "Max patients per day must be at least 1")
      .max(1000, "Max patients per day must not exceed 1000")
      .optional(),
    appointmentDuration: z
      .number()
      .int("Appointment duration must be an integer")
      .min(5, "Appointment duration must be at least 5 minutes")
      .max(480, "Appointment duration must not exceed 480 minutes")
      .optional(),
    gracePeriod: z
      .number()
      .int("Grace period must be an integer")
      .min(1, "Grace period must be at least 1 minute")
      .max(120, "Grace period must not exceed 120 minutes")
      .optional(),
    delayThreshold: z
      .number()
      .int("Delay threshold must be an integer")
      .min(1, "Delay threshold must be at least 1 minute")
      .max(240, "Delay threshold must not exceed 240 minutes")
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateClinicSettingsInput = z.infer<
  typeof updateClinicSettingsSchema
>;
