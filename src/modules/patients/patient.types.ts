// src/modules/patients/patient.types.ts

import type { Gender } from "@prisma/client";

export interface PatientFilters {
  search?: string;
  gender?: Gender;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface PatientListResult {
  patients: PatientSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface PatientSummary {
  id: string;
  clinicId: string;
  mrn: string;
  fullName: string;
  phone: string;
  dateOfBirth: Date;
  gender: Gender;
  address: string | null;
  notes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    fullName: string;
  } | null;
  updatedBy: {
    id: string;
    fullName: string;
  } | null;
}

export interface PatientDetail extends PatientSummary {
  visits: {
    id: string;
    visitDate: Date;
    chiefComplaint: string | null;
    diagnosis: string | null;
    createdAt: Date;
  }[];
  appointments: {
    id: string;
    appointmentDate: Date;
    appointmentTime: Date;
    status: string;
    notes: string | null;
  }[];
}
