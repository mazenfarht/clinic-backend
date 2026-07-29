// src/modules/visits/visit.types.ts

export interface VisitSummary {
  id: string;
  clinicId: string;
  patientId: string;
  visitDate: Date;
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
  prescription: string | null;
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

export interface VisitDetail extends VisitSummary {
  appointment: {
    id: string;
    appointmentDate: Date;
    appointmentTime: Date;
    status: string;
    notes: string | null;
  } | null;
  queueEntry: {
    id: string;
    queueNumber: number;
    status: string;
    calledAt: Date | null;
    servedAt: Date | null;
  } | null;
}

export interface VisitFilters {
  search?: string;
  patientId?: string;
  createdById?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
  sortBy?: "visitDate" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export interface VisitListResult {
  visits: VisitSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
