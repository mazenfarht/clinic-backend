import {
  createAppointmentSchema,
  updateAppointmentSchema,
  appointmentQuerySchema,
  appointmentIdSchema,
} from "../../../src/modules/appointments/appointment.validation";

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

describe("createAppointmentSchema", () => {
  const base = {
    patientId: "11111111-1111-1111-1111-111111111111",
    appointmentDate: futureDate(1),
    appointmentTime: "09:30",
  };

  it("accepts a valid future appointment", () => {
    expect(createAppointmentSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an appointment date in the past", () => {
    expect(
      createAppointmentSchema.safeParse({
        ...base,
        appointmentDate: "2000-01-01",
      }).success
    ).toBe(false);
  });

  it("rejects a malformed time", () => {
    expect(
      createAppointmentSchema.safeParse({ ...base, appointmentTime: "9:30am" })
        .success
    ).toBe(false);
  });

  it("rejects an out-of-range time", () => {
    expect(
      createAppointmentSchema.safeParse({ ...base, appointmentTime: "25:00" })
        .success
    ).toBe(false);
  });

  it("rejects a non-UUID patientId", () => {
    expect(
      createAppointmentSchema.safeParse({ ...base, patientId: "not-a-uuid" })
        .success
    ).toBe(false);
  });
});

describe("updateAppointmentSchema", () => {
  it("rejects an empty payload", () => {
    expect(updateAppointmentSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a notes-only update", () => {
    expect(
      updateAppointmentSchema.safeParse({ notes: "Rescheduled" }).success
    ).toBe(true);
  });
});

describe("appointmentQuerySchema", () => {
  it("defaults page/limit", () => {
    const result = appointmentQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("accepts a valid status filter", () => {
    expect(
      appointmentQuerySchema.safeParse({ status: "CONFIRMED" }).success
    ).toBe(true);
  });

  it("rejects an invalid status filter", () => {
    expect(appointmentQuerySchema.safeParse({ status: "BOGUS" }).success).toBe(
      false
    );
  });
});

describe("appointmentIdSchema", () => {
  it("rejects non-UUID ids", () => {
    expect(appointmentIdSchema.safeParse({ id: "123" }).success).toBe(false);
  });
});
