import {
  clinicIdParamSchema,
  availabilityQuerySchema,
  patientLookupSchema,
  publicRegisterPatientSchema,
  publicBookAppointmentSchema,
} from "../../../src/modules/public/public.validation";

describe("clinicIdParamSchema", () => {
  it("rejects a non-UUID clinicId", () => {
    expect(clinicIdParamSchema.safeParse({ clinicId: "abc" }).success).toBe(
      false
    );
  });
});

describe("availabilityQuerySchema", () => {
  it("requires a valid YYYY-MM-DD date", () => {
    expect(
      availabilityQuerySchema.safeParse({ date: "2026-01-01" }).success
    ).toBe(true);
    expect(
      availabilityQuerySchema.safeParse({ date: "01/01/2026" }).success
    ).toBe(false);
  });
});

describe("patientLookupSchema", () => {
  it("validates phone format and length", () => {
    expect(
      patientLookupSchema.safeParse({ phone: "+1234567890" }).success
    ).toBe(true);
    expect(patientLookupSchema.safeParse({ phone: "123" }).success).toBe(false);
  });
});

describe("publicRegisterPatientSchema", () => {
  const base = {
    fullName: "Walk In Patient",
    phone: "+1234567890",
    dateOfBirth: "1990-01-01",
    gender: "OTHER",
  };

  it("accepts a valid registration", () => {
    expect(publicRegisterPatientSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a future date of birth", () => {
    expect(
      publicRegisterPatientSchema.safeParse({
        ...base,
        dateOfBirth: "2999-01-01",
      }).success
    ).toBe(false);
  });

  it("rejects an invalid gender", () => {
    expect(
      publicRegisterPatientSchema.safeParse({ ...base, gender: "X" }).success
    ).toBe(false);
  });
});

describe("publicBookAppointmentSchema", () => {
  const base = {
    patientId: "11111111-1111-1111-1111-111111111111",
    appointmentDate: "2026-01-01",
    appointmentTime: "09:00",
  };

  it("accepts a valid booking payload", () => {
    expect(publicBookAppointmentSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a malformed appointmentTime", () => {
    expect(
      publicBookAppointmentSchema.safeParse({ ...base, appointmentTime: "9am" })
        .success
    ).toBe(false);
  });
});
