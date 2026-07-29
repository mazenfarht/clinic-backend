// src/modules/dashboard/dashboard.service.ts

import prisma from "../../config/database";
import type {
  OverviewStats,
  TodayStats,
  TodayAppointmentItem,
  TodayVisitItem,
  QueueDashboard,
  QueuePatientItem,
  AppointmentsDashboard,
  AppointmentDashboardItem,
  PatientsDashboard,
  RecentPatientItem,
  RecentlyVisitedItem,
  AnalyticsDashboard,
  DailyCount,
  MonthlyCount,
} from "./dashboard.types";
import type {
  OverviewQueryInput,
  TodayQueryInput,
  QueueDashboardQueryInput,
  AppointmentsDashboardQueryInput,
  PatientsDashboardQueryInput,
  AnalyticsQueryInput,
} from "./dashboard.validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDateBounds(dateStr?: string): { start: Date; end: Date } {
  const base = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : new Date();
  const start = new Date(base);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function getDefaultAnalyticsPeriod(): { fromDate: string; toDate: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    fromDate: from.toISOString().split("T")[0],
    toDate: to.toISOString().split("T")[0],
  };
}

function calculateAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return parseFloat(
    (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
  );
}

async function computeQueueTimeMetrics(
  clinicId: string,
  start: Date,
  end: Date
): Promise<{
  averageWaitTimeMinutes: number | null;
  averageServeTimeMinutes: number | null;
}> {
  const servedEntries = await prisma.queueEntry.findMany({
    where: {
      clinicId,
      queueDate: { gte: start, lte: end },
      status: "SERVED",
      calledAt: { not: null },
      servedAt: { not: null },
    },
    select: {
      createdAt: true,
      calledAt: true,
      servedAt: true,
    },
  });

  const waitTimes = servedEntries
    .filter((e) => e.calledAt !== null)
    .map((e) => (e.calledAt!.getTime() - e.createdAt.getTime()) / 60000);

  const serveTimes = servedEntries
    .filter((e) => e.calledAt !== null && e.servedAt !== null)
    .map((e) => (e.servedAt!.getTime() - e.calledAt!.getTime()) / 60000);

  return {
    averageWaitTimeMinutes: calculateAverage(waitTimes),
    averageServeTimeMinutes: calculateAverage(serveTimes),
  };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverview(
  clinicId: string,
  input: OverviewQueryInput
): Promise<OverviewStats> {
  const { start, end } = getDateBounds(input.date);

  const [
    totalPatients,
    activePatients,
    deletedPatients,
    totalAppointments,
    todayAppointments,
    scheduledAppointments,
    completedAppointments,
    cancelledAppointments,
    totalVisits,
    todayVisits,
    waitingPatients,
    currentlyServing,
    servedToday,
    cancelledToday,
  ] = await prisma.$transaction([
    prisma.patient.count({ where: { clinicId } }),
    prisma.patient.count({ where: { clinicId, deletedAt: null } }),
    prisma.patient.count({ where: { clinicId, deletedAt: { not: null } } }),
    prisma.appointment.count({ where: { clinicId } }),
    prisma.appointment.count({
      where: { clinicId, appointmentDate: { gte: start, lte: end } },
    }),
    prisma.appointment.count({ where: { clinicId, status: "SCHEDULED" } }),
    prisma.appointment.count({ where: { clinicId, status: "COMPLETED" } }),
    prisma.appointment.count({ where: { clinicId, status: "CANCELLED" } }),
    prisma.visit.count({ where: { clinicId } }),
    prisma.visit.count({
      where: { clinicId, visitDate: { gte: start, lte: end } },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "WAITING",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "IN_PROGRESS",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "SERVED",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "CANCELLED",
      },
    }),
  ]);

  return {
    totalPatients,
    activePatients,
    deletedPatients,
    totalAppointments,
    todayAppointments,
    scheduledAppointments,
    completedAppointments,
    cancelledAppointments,
    totalVisits,
    todayVisits,
    waitingPatients,
    currentlyServing,
    servedToday,
    cancelledToday,
  };
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export async function getToday(
  clinicId: string,
  input: TodayQueryInput
): Promise<TodayStats> {
  const { start, end } = getDateBounds(input.date);
  const dateStr = (input.date ?? new Date().toISOString()).split("T")[0];

  const [
    appointments,
    scheduledCount,
    completedCount,
    cancelledCount,
    visits,
    queueTotal,
    queueWaiting,
    queueInProgress,
    queueServed,
    queueCancelled,
  ] = await prisma.$transaction([
    prisma.appointment.findMany({
      where: { clinicId, appointmentDate: { gte: start, lte: end } },
      select: {
        id: true,
        appointmentTime: true,
        status: true,
        notes: true,
        patient: {
          select: { id: true, fullName: true, phone: true, mrn: true },
        },
      },
      orderBy: { appointmentTime: "asc" },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        appointmentDate: { gte: start, lte: end },
        status: "SCHEDULED",
      },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        appointmentDate: { gte: start, lte: end },
        status: "COMPLETED",
      },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        appointmentDate: { gte: start, lte: end },
        status: "CANCELLED",
      },
    }),
    prisma.visit.findMany({
      where: { clinicId, visitDate: { gte: start, lte: end } },
      select: {
        id: true,
        visitDate: true,
        chiefComplaint: true,
        diagnosis: true,
        patient: {
          select: { id: true, fullName: true, phone: true, mrn: true },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.queueEntry.count({
      where: { clinicId, queueDate: { gte: start, lte: end } },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "WAITING",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "IN_PROGRESS",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "SERVED",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "CANCELLED",
      },
    }),
  ]);

  const { averageWaitTimeMinutes, averageServeTimeMinutes } =
    await computeQueueTimeMetrics(clinicId, start, end);

  return {
    date: dateStr,
    appointments: {
      total: appointments.length,
      scheduled: scheduledCount,
      completed: completedCount,
      cancelled: cancelledCount,
      list: appointments as TodayAppointmentItem[],
    },
    visits: {
      total: visits.length,
      list: visits as TodayVisitItem[],
    },
    queue: {
      total: queueTotal,
      waiting: queueWaiting,
      inProgress: queueInProgress,
      served: queueServed,
      cancelled: queueCancelled,
      averageWaitTimeMinutes,
      averageServeTimeMinutes,
    },
  };
}

// ---------------------------------------------------------------------------
// Queue dashboard
// ---------------------------------------------------------------------------

export async function getQueueDashboard(
  clinicId: string,
  input: QueueDashboardQueryInput
): Promise<QueueDashboard> {
  const { start, end } = getDateBounds(input.date);
  const dateStr = (input.date ?? new Date().toISOString()).split("T")[0];
  const { page = 1, limit = 20 } = input;
  const skip = (page - 1) * limit;

  const queueEntrySelect = {
    id: true,
    queueNumber: true,
    status: true,
    isReserved: true,
    reservedFor: true,
    calledAt: true,
    servedAt: true,
    createdAt: true,
    visit: {
      select: {
        id: true,
        chiefComplaint: true,
        patient: {
          select: { id: true, fullName: true, phone: true, mrn: true },
        },
      },
    },
  } as const;

  const [
    currentlyServing,
    nextWaiting,
    waitingList,
    total,
    waiting,
    inProgress,
    served,
    cancelled,
  ] = await prisma.$transaction([
    prisma.queueEntry.findFirst({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "IN_PROGRESS",
      },
      select: queueEntrySelect,
      orderBy: { calledAt: "desc" },
    }),
    prisma.queueEntry.findFirst({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "WAITING",
      },
      select: queueEntrySelect,
      orderBy: { queueNumber: "asc" },
    }),
    prisma.queueEntry.findMany({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "WAITING",
      },
      select: queueEntrySelect,
      orderBy: { queueNumber: "asc" },
      skip,
      take: limit,
    }),
    prisma.queueEntry.count({
      where: { clinicId, queueDate: { gte: start, lte: end } },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "WAITING",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "IN_PROGRESS",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "SERVED",
      },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: start, lte: end },
        status: "CANCELLED",
      },
    }),
  ]);

  const { averageWaitTimeMinutes, averageServeTimeMinutes } =
    await computeQueueTimeMetrics(clinicId, start, end);

  return {
    date: dateStr,
    currentlyServing: currentlyServing as QueuePatientItem | null,
    nextWaiting: nextWaiting as QueuePatientItem | null,
    waitingList: waitingList as QueuePatientItem[],
    statistics: {
      total,
      waiting,
      inProgress,
      served,
      cancelled,
      averageWaitTimeMinutes,
      averageServeTimeMinutes,
    },
  };
}

// ---------------------------------------------------------------------------
// Appointments dashboard
// ---------------------------------------------------------------------------

export async function getAppointmentsDashboard(
  clinicId: string,
  input: AppointmentsDashboardQueryInput
): Promise<AppointmentsDashboard> {
  const { page = 1, limit = 10 } = input;
  const skip = (page - 1) * limit;

  const now = new Date();
  const fromDate = input.fromDate
    ? new Date(`${input.fromDate}T00:00:00.000Z`)
    : now;
  const toDate = input.toDate
    ? new Date(`${input.toDate}T23:59:59.999Z`)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const appointmentSelect = {
    id: true,
    appointmentDate: true,
    appointmentTime: true,
    status: true,
    notes: true,
    patient: { select: { id: true, fullName: true, phone: true, mrn: true } },
  } as const;

  const [
    upcoming,
    completed,
    cancelled,
    totalUpcoming,
    totalCompleted,
    totalCancelled,
  ] = await prisma.$transaction([
    prisma.appointment.findMany({
      where: {
        clinicId,
        status: "SCHEDULED",
        appointmentDate: { gte: fromDate, lte: toDate },
      },
      select: appointmentSelect,
      orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }],
      skip,
      take: limit,
    }),
    prisma.appointment.findMany({
      where: {
        clinicId,
        status: "COMPLETED",
        appointmentDate: { gte: fromDate, lte: toDate },
      },
      select: appointmentSelect,
      orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      skip,
      take: limit,
    }),
    prisma.appointment.findMany({
      where: {
        clinicId,
        status: "CANCELLED",
        appointmentDate: { gte: fromDate, lte: toDate },
      },
      select: appointmentSelect,
      orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      skip,
      take: limit,
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        status: "SCHEDULED",
        appointmentDate: { gte: fromDate, lte: toDate },
      },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        status: "COMPLETED",
        appointmentDate: { gte: fromDate, lte: toDate },
      },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        status: "CANCELLED",
        appointmentDate: { gte: fromDate, lte: toDate },
      },
    }),
  ]);

  return {
    upcoming: upcoming as AppointmentDashboardItem[],
    completed: completed as AppointmentDashboardItem[],
    cancelled: cancelled as AppointmentDashboardItem[],
    summary: {
      totalUpcoming,
      totalCompleted,
      totalCancelled,
    },
  };
}

// ---------------------------------------------------------------------------
// Patients dashboard
// ---------------------------------------------------------------------------

export async function getPatientsDashboard(
  clinicId: string,
  input: PatientsDashboardQueryInput
): Promise<PatientsDashboard> {
  const { page = 1, limit = 10 } = input;
  const skip = (page - 1) * limit;

  const [
    totalActive,
    totalDeleted,
    maleCount,
    femaleCount,
    otherCount,
    recentlyRegistered,
    recentlyVisitedRaw,
  ] = await prisma.$transaction([
    prisma.patient.count({ where: { clinicId, deletedAt: null } }),
    prisma.patient.count({ where: { clinicId, deletedAt: { not: null } } }),
    prisma.patient.count({
      where: { clinicId, deletedAt: null, gender: "MALE" },
    }),
    prisma.patient.count({
      where: { clinicId, deletedAt: null, gender: "FEMALE" },
    }),
    prisma.patient.count({
      where: { clinicId, deletedAt: null, gender: "OTHER" },
    }),
    prisma.patient.findMany({
      where: { clinicId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        phone: true,
        mrn: true,
        gender: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.visit.findMany({
      where: { clinicId },
      select: {
        visitDate: true,
        patient: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            mrn: true,
          },
        },
      },
      orderBy: { visitDate: "desc" },
      distinct: ["patientId"],
      skip,
      take: limit,
    }),
  ]);

  const recentlyVisited: RecentlyVisitedItem[] = recentlyVisitedRaw.map(
    (v) => ({
      id: v.patient.id,
      fullName: v.patient.fullName,
      phone: v.patient.phone,
      mrn: v.patient.mrn,
      lastVisit: v.visitDate,
    })
  );

  return {
    totalActive,
    totalDeleted,
    recentlyRegistered: recentlyRegistered as RecentPatientItem[],
    recentlyVisited,
    genderBreakdown: {
      male: maleCount,
      female: femaleCount,
      other: otherCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function getAnalytics(
  clinicId: string,
  input: AnalyticsQueryInput
): Promise<AnalyticsDashboard> {
  const defaults = getDefaultAnalyticsPeriod();
  const fromDate = input.fromDate ?? defaults.fromDate;
  const toDate = input.toDate ?? defaults.toDate;

  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T23:59:59.999Z`);

  const [
    visits,
    appointments,
    patients,
    queueServed,
    queueCancelled,
    queueTotal,
    appointmentCompleted,
    appointmentCancelled,
    appointmentTotal,
  ] = await prisma.$transaction([
    prisma.visit.findMany({
      where: { clinicId, visitDate: { gte: from, lte: to } },
      select: { visitDate: true },
      orderBy: { visitDate: "asc" },
    }),
    prisma.appointment.findMany({
      where: { clinicId, appointmentDate: { gte: from, lte: to } },
      select: { appointmentDate: true },
      orderBy: { appointmentDate: "asc" },
    }),
    prisma.patient.findMany({
      where: { clinicId, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.queueEntry.count({
      where: { clinicId, queueDate: { gte: from, lte: to }, status: "SERVED" },
    }),
    prisma.queueEntry.count({
      where: {
        clinicId,
        queueDate: { gte: from, lte: to },
        status: "CANCELLED",
      },
    }),
    prisma.queueEntry.count({
      where: { clinicId, queueDate: { gte: from, lte: to } },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        appointmentDate: { gte: from, lte: to },
        status: "COMPLETED",
      },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        appointmentDate: { gte: from, lte: to },
        status: "CANCELLED",
      },
    }),
    prisma.appointment.count({
      where: { clinicId, appointmentDate: { gte: from, lte: to } },
    }),
  ]);

  const { averageWaitTimeMinutes, averageServeTimeMinutes } =
    await computeQueueTimeMetrics(clinicId, from, to);

  // Aggregate visits per day
  const visitDayMap = new Map<string, number>();
  for (const v of visits) {
    const key = v.visitDate.toISOString().split("T")[0];
    visitDayMap.set(key, (visitDayMap.get(key) ?? 0) + 1);
  }
  const visitsPerDay: DailyCount[] = Array.from(visitDayMap.entries()).map(
    ([date, count]) => ({ date, count })
  );

  // Aggregate appointments per day
  const apptDayMap = new Map<string, number>();
  for (const a of appointments) {
    const key = a.appointmentDate.toISOString().split("T")[0];
    apptDayMap.set(key, (apptDayMap.get(key) ?? 0) + 1);
  }
  const appointmentsPerDay: DailyCount[] = Array.from(apptDayMap.entries()).map(
    ([date, count]) => ({ date, count })
  );

  // Aggregate patients registered per month
  const patientMonthMap = new Map<string, number>();
  for (const p of patients) {
    const d = p.createdAt;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}`;
    patientMonthMap.set(key, (patientMonthMap.get(key) ?? 0) + 1);
  }
  const patientsRegisteredPerMonth: MonthlyCount[] = Array.from(
    patientMonthMap.entries()
  ).map(([month, count]) => ({ month, count }));

  const queueCompletionRate =
    queueTotal > 0
      ? parseFloat(((queueServed / queueTotal) * 100).toFixed(1))
      : 0;
  const queueCancellationRate =
    queueTotal > 0
      ? parseFloat(((queueCancelled / queueTotal) * 100).toFixed(1))
      : 0;
  const apptCompletionRate =
    appointmentTotal > 0
      ? parseFloat(((appointmentCompleted / appointmentTotal) * 100).toFixed(1))
      : 0;
  const apptCancellationRate =
    appointmentTotal > 0
      ? parseFloat(((appointmentCancelled / appointmentTotal) * 100).toFixed(1))
      : 0;

  return {
    period: { from: fromDate, to: toDate },
    visitsPerDay,
    appointmentsPerDay,
    patientsRegisteredPerMonth,
    queueMetrics: {
      totalServed: queueServed,
      totalCancelled: queueCancelled,
      completionRate: queueCompletionRate,
      cancellationRate: queueCancellationRate,
      averageWaitTimeMinutes,
      averageServeTimeMinutes,
    },
    appointmentMetrics: {
      totalCompleted: appointmentCompleted,
      totalCancelled: appointmentCancelled,
      completionRate: apptCompletionRate,
      cancellationRate: apptCancellationRate,
    },
  };
}
