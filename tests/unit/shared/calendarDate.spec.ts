import {
  isValidCalendarDate,
  parseCalendarDate,
} from "../../../src/shared/utils/calendarDate";
import { createPatientSchema } from "../../../src/modules/patients/patient.validation";
import {
  publicBookAppointmentSchema,
  publicRegisterPatientSchema,
  availabilityQuerySchema,
} from "../../../src/modules/public/public.validation";
import { visitQuerySchema } from "../../../src/modules/visits/visit.validation";
import { queueQuerySchema } from "../../../src/modules/queue/queue.validation";
import { appointmentQuerySchema } from "../../../src/modules/appointments/appointment.validation";

describe("isValidCalendarDate", () => {
  it.each([
    "2026-02-31",
    "2026-02-30",
    "2026-02-29", // 2026 is not a leap year
    "2026-04-31",
    "2026-06-31",
    "2026-09-31",
    "2026-11-31",
    "2026-13-01",
    "2026-00-10",
    "2026-01-00",
    "2026-01-32",
    "1900-02-29", // 1900 is not a leap year
    "2026-1-5",
    "2026-02-3",
    "",
    "not-a-date",
  ])("rejects %s", (value) => {
    expect(isValidCalendarDate(value)).toBe(false);
  });

  it.each([
    "2026-02-28",
    "2028-02-29", // leap year
    "2000-02-29", // divisible by 400
    "2026-01-31",
    "2026-12-31",
    "2026-04-30",
    "0999-05-05",
  ])("accepts %s", (value) => {
    expect(isValidCalendarDate(value)).toBe(true);
  });

  it("parseCalendarDate returns UTC midnight, or null when impossible", () => {
    expect(parseCalendarDate("2028-02-29")?.toISOString()).toBe(
      "2028-02-29T00:00:00.000Z"
    );
    expect(parseCalendarDate("2026-02-31")).toBeNull();
  });
});

describe("validators reject impossible calendar dates (no silent roll-over)", () => {
  it("patient date of birth", () => {
    const base = {
      fullName: "Test Patient",
      phone: "+15550001234",
      gender: "MALE",
    };
    expect(
      createPatientSchema.safeParse({ ...base, dateOfBirth: "1995-02-31" })
        .success
    ).toBe(false);
    expect(
      createPatientSchema.safeParse({ ...base, dateOfBirth: "1996-02-29" })
        .success
    ).toBe(true);
  });

  it("public register date of birth", () => {
    const base = { fullName: "Test", phone: "+15550001234", gender: "OTHER" };
    expect(
      publicRegisterPatientSchema.safeParse({ ...base, dateOfBirth: "1995-04-31" })
        .success
    ).toBe(false);
  });

  it("public booking date", () => {
    const base = {
      patientId: "11111111-1111-4111-8111-111111111111",
      doctorId: "22222222-2222-4222-8222-222222222222",
      appointmentTime: "10:00",
    };
    expect(
      publicBookAppointmentSchema.safeParse({ ...base, appointmentDate: "2099-02-31" })
        .success
    ).toBe(false);
    expect(
      publicBookAppointmentSchema.safeParse({ ...base, appointmentDate: "2099-02-28" })
        .success
    ).toBe(true);
  });

  it("public availability date", () => {
    expect(
      availabilityQuerySchema.safeParse({
        doctorId: "22222222-2222-4222-8222-222222222222",
        date: "2099-06-31",
      }).success
    ).toBe(false);
  });

  it("list filters: visits, queue, appointments", () => {
    expect(visitQuerySchema.safeParse({ date: "2026-02-31" }).success).toBe(false);
    expect(visitQuerySchema.safeParse({ fromDate: "2026-02-30" }).success).toBe(false);
    expect(visitQuerySchema.safeParse({ toDate: "2026-04-31" }).success).toBe(false);
    expect(queueQuerySchema.safeParse({ date: "2026-02-31" }).success).toBe(false);
    expect(appointmentQuerySchema.safeParse({ date: "2026-02-31" }).success).toBe(false);
    expect(visitQuerySchema.safeParse({ date: "2028-02-29" }).success).toBe(true);
  });
});
