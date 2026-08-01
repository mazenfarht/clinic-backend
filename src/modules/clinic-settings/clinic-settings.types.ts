// src/modules/clinic-settings/clinic-settings.types.ts

export interface WorkingHoursDay {
  open: string;
  close: string;
  isOpen: boolean;
}

export interface WorkingHours {
  monday: WorkingHoursDay;
  tuesday: WorkingHoursDay;
  wednesday: WorkingHoursDay;
  thursday: WorkingHoursDay;
  friday: WorkingHoursDay;
  saturday: WorkingHoursDay;
  sunday: WorkingHoursDay;
}

export interface ClinicSettingsResponse {
  id: string;
  clinicId: string;
  workingHours: WorkingHours;
  maxPatientsPerDay: number;
  createdAt: Date;
  updatedAt: Date;
  clinic: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface UpdateClinicSettingsPayload {
  clinic?: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  settings?: {
    workingHours?: WorkingHours;
    maxPatientsPerDay?: number;
  };
}
