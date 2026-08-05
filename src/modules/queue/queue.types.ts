// src/modules/queue/queue.types.ts

import type { QueueStatus } from "@prisma/client";

export interface QueueEntryFilters {
  status?: QueueStatus;
  date?: string;
  page?: number;
  limit?: number;
}

export interface QueueEntrySummary {
  id: string;
  clinicId: string;
  visitId: string | null;
  queueDate: Date;
  queueNumber: number;
  isReserved: boolean;
  reservedFor: string | null;
  status: QueueStatus;
  checkedInAt: Date | null;
  calledAt: Date | null;
  startedAt: Date | null;
  servedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  visit: {
    id: string;
    visitDate: Date;
    chiefComplaint: string | null;
    patient: {
      id: string;
      fullName: string;
      phone: string;
      mrn: string;
    };
  } | null;
  createdBy: {
    id: string;
    fullName: string;
  } | null;
  updatedBy: {
    id: string;
    fullName: string;
  } | null;
}

export interface QueueStatistics {
  date: string;
  total: number;
  waiting: number;
  inProgress: number;
  served: number;
  cancelled: number;
  averageWaitTimeMinutes: number | null;
  averageServeTimeMinutes: number | null;
}

export interface QueueStatus_Current {
  currentlyServing: QueueEntrySummary | null;
  nextWaiting: QueueEntrySummary | null;
  waitingCount: number;
  servedCount: number;
}

export interface QueueListResult {
  entries: QueueEntrySummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export const QUEUE_STATUS_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  WAITING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SERVED", "WAITING", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};
