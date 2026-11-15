// src/modules/admin/stats/admin-stats.service.ts
//
// Platform-wide numbers. Counts only — no patient or visit data.

import prisma from "../../../config/database";
import {
  endOfMonthDateStr,
  getClinicTodayStr,
} from "../../../shared/utils/clinicTime";

export async function getPlatformStats() {
  // "This month" on the clinic (Cairo) calendar, as UTC-midnight date bounds
  // (matches the @db.Date columns).
  const today = getClinicTodayStr();
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const monthEnd = new Date(`${endOfMonthDateStr(today)}T00:00:00.000Z`);

  const [
    activeClinics,
    inactiveClinics,
    doctors,
    receptionists,
    patients,
    appointmentsThisMonth,
    visitsThisMonth,
  ] = await prisma.$transaction([
    prisma.clinic.count({ where: { isActive: true } }),
    prisma.clinic.count({ where: { isActive: false } }),
    prisma.doctor.count(),
    prisma.user.count({ where: { role: "RECEPTIONIST" } }),
    prisma.patient.count({ where: { deletedAt: null } }),
    prisma.appointment.count({
      where: { appointmentDate: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.visit.count({
      where: { visitDate: { gte: monthStart, lte: monthEnd } },
    }),
  ]);

  return {
    clinics: {
      total: activeClinics + inactiveClinics,
      active: activeClinics,
      inactive: inactiveClinics,
    },
    doctors,
    receptionists,
    patients,
    thisMonth: {
      appointments: appointmentsThisMonth,
      visits: visitsThisMonth,
    },
    generatedAt: new Date().toISOString(),
  };
}
