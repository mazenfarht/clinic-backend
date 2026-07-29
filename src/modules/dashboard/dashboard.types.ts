// src/modules/dashboard/dashboard.types.ts

export interface OverviewStats {
  totalPatients: number;
  activePatients: number;
  deletedPatients: number;
  totalAppointments: number;
  todayAppointments: number;
  scheduledAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  totalVisits: number;
  todayVisits: number;
  waitingPatients: number;
  currentlyServing: number;
  servedToday: number;
  cancelledToday: number;
}

export interface TodayStats {
  date: string;
  appointments: {
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
    list: TodayAppointmentItem[];
  };
  visits: {
    total: number;
    list: TodayVisitItem[];
  };
  queue: {
    total: number;
    waiting: number;
    inProgress: number;
    served: number;
    cancelled: number;
    averageWaitTimeMinutes: number | null;
    averageServeTimeMinutes: number | null;
  };
}

export interface TodayAppointmentItem {
  id: string;
  appointmentTime: Date;
  status: string;
  notes: string | null;
  patient: {
    id: string;
    fullName: string;
    phone: string;
    mrn: string;
  };
}

export interface TodayVisitItem {
  id: string;
  visitDate: Date;
  chiefComplaint: string | null;
  diagnosis: string | null;
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
}

export interface QueueDashboard {
  date: string;
  currentlyServing: QueuePatientItem | null;
  nextWaiting: QueuePatientItem | null;
  waitingList: QueuePatientItem[];
  statistics: {
    total: number;
    waiting: number;
    inProgress: number;
    served: number;
    cancelled: number;
    averageWaitTimeMinutes: number | null;
    averageServeTimeMinutes: number | null;
  };
}

export interface QueuePatientItem {
  id: string;
  queueNumber: number;
  status: string;
  isReserved: boolean;
  reservedFor: string | null;
  calledAt: Date | null;
  servedAt: Date | null;
  createdAt: Date;
  visit: {
    id: string;
    chiefComplaint: string | null;
    patient: {
      id: string;
      fullName: string;
      phone: string;
      mrn: string;
    };
  } | null;
}

export interface AppointmentsDashboard {
  upcoming: AppointmentDashboardItem[];
  completed: AppointmentDashboardItem[];
  cancelled: AppointmentDashboardItem[];
  summary: {
    totalUpcoming: number;
    totalCompleted: number;
    totalCancelled: number;
  };
}

export interface AppointmentDashboardItem {
  id: string;
  appointmentDate: Date;
  appointmentTime: Date;
  status: string;
  notes: string | null;
  patient: {
    id: string;
    fullName: string;
    phone: string;
    mrn: string;
  };
}

export interface PatientsDashboard {
  totalActive: number;
  totalDeleted: number;
  recentlyRegistered: RecentPatientItem[];
  recentlyVisited: RecentlyVisitedItem[];
  genderBreakdown: {
    male: number;
    female: number;
    other: number;
  };
}

export interface RecentPatientItem {
  id: string;
  fullName: string;
  phone: string;
  mrn: string;
  gender: string;
  createdAt: Date;
}

export interface RecentlyVisitedItem {
  id: string;
  fullName: string;
  phone: string;
  mrn: string;
  lastVisit: Date;
}

export interface AnalyticsDashboard {
  period: {
    from: string;
    to: string;
  };
  visitsPerDay: DailyCount[];
  appointmentsPerDay: DailyCount[];
  patientsRegisteredPerMonth: MonthlyCount[];
  queueMetrics: {
    totalServed: number;
    totalCancelled: number;
    completionRate: number;
    cancellationRate: number;
    averageWaitTimeMinutes: number | null;
    averageServeTimeMinutes: number | null;
  };
  appointmentMetrics: {
    totalCompleted: number;
    totalCancelled: number;
    completionRate: number;
    cancellationRate: number;
  };
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface MonthlyCount {
  month: string;
  count: number;
}
