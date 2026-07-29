// src/modules/dashboard/dashboard.validation.ts

import { z } from "zod";

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((val) => !isNaN(new Date(val).getTime()), "Invalid date");

const paginationSchema = {
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
};

export const overviewQuerySchema = z.object({
  date: dateSchema.optional(),
});

export const todayQuerySchema = z.object({
  date: dateSchema.optional(),
});

export const queueDashboardQuerySchema = z.object({
  date: dateSchema.optional(),
  ...paginationSchema,
});

export const appointmentsDashboardQuerySchema = z.object({
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  ...paginationSchema,
});

export const patientsDashboardQuerySchema = z.object({
  ...paginationSchema,
});

export const analyticsQuerySchema = z
  .object({
    fromDate: dateSchema.optional(),
    toDate: dateSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.fromDate && data.toDate) {
        return new Date(data.fromDate) <= new Date(data.toDate);
      }
      return true;
    },
    {
      message: "fromDate must be before or equal to toDate",
      path: ["fromDate"],
    }
  );

export type OverviewQueryInput = z.infer<typeof overviewQuerySchema>;
export type TodayQueryInput = z.infer<typeof todayQuerySchema>;
export type QueueDashboardQueryInput = z.infer<
  typeof queueDashboardQuerySchema
>;
export type AppointmentsDashboardQueryInput = z.infer<
  typeof appointmentsDashboardQuerySchema
>;
export type PatientsDashboardQueryInput = z.infer<
  typeof patientsDashboardQuerySchema
>;
export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
