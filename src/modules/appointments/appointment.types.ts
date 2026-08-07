// src/modules/appointments/appointment.types.ts

import type { AppointmentStatus } from "@prisma/client";

export interface AppointmentFilters {
  search?: string;
  status?: AppointmentStatus;
  patientId?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface AppointmentSummary {
  id: string;
  clinicId: string;
  patientId: string;
  visitId: string | null;
  appointmentDate: Date;
  appointmentTime: Date;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  patient: {
    id: string;
    fullName: string;
    phone: string;
    mrn: string;
  };
  createdBy: {
    id: string;
    fullName: string;
  } | null;
  updatedBy: {
    id: string;
    fullName: string;
  } | null;
}

export interface AppointmentDetail extends AppointmentSummary {
  visit: {
    id: string;
    visitDate: Date;
    chiefComplaint: string | null;
    diagnosis: string | null;
    treatment: string | null;
    prescription: string | null;
    notes: string | null;
    createdAt: Date;
  } | null;
}

export interface AppointmentListResult {
  appointments: AppointmentSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export type AllowedStatusTransition = {
  from: AppointmentStatus;
  to: AppointmentStatus;
};

export const ALLOWED_STATUS_TRANSITIONS: AllowedStatusTransition[] = [
  { from: "SCHEDULED", to: "CONFIRMED" },
  { from: "SCHEDULED", to: "CANCELLED" },
  { from: "SCHEDULED", to: "NO_SHOW" },
  { from: "CONFIRMED", to: "CANCELLED" },
  { from: "CONFIRMED", to: "COMPLETED" },
  { from: "CONFIRMED", to: "NO_SHOW" },
];

export const STATUSES_BLOCKING_CONFLICT: AppointmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
];
