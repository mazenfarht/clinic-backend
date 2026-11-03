import {
  createPatientSchema,
  updatePatientSchema,
  patientQuerySchema,
  patientIdSchema,
} from "../../../src/modules/patients/patient.validation";

const validPatient = {
  mrn: "MRN-0001",
  fullName: "John Doe",
  phone: "+1234567890",
  dateOfBirth: "1990-05-15",
  gender: "MALE",
};

describe("createPatientSchema", () => {
  it("accepts a fully valid patient", () => {
    expect(createPatientSchema.safeParse(validPatient).success).toBe(true);
  });

  it("rejects an MRN with invalid characters", () => {
    expect(
      createPatientSchema.safeParse({ ...validPatient, mrn: "MRN #1" }).success
    ).toBe(false);
  });

  it("rejects a future date of birth", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(
      createPatientSchema.safeParse({
        ...validPatient,
        dateOfBirth: future.toISOString().split("T")[0],
      }).success
    ).toBe(false);
  });

  it("rejects a date of birth before 1900-01-01", () => {
    expect(
      createPatientSchema.safeParse({
        ...validPatient,
        dateOfBirth: "1850-01-01",
      }).success
    ).toBe(false);
  });

  it("rejects a malformed date of birth", () => {
    expect(
      createPatientSchema.safeParse({
        ...validPatient,
        dateOfBirth: "15-05-1990",
      }).success
    ).toBe(false);
  });

  it("rejects an invalid gender", () => {
    expect(
      createPatientSchema.safeParse({ ...validPatient, gender: "UNKNOWN" })
        .success
    ).toBe(false);
  });

  it("rejects a phone number that is too short", () => {
    expect(
      createPatientSchema.safeParse({ ...validPatient, phone: "123" }).success
    ).toBe(false);
  });
});

describe("updatePatientSchema", () => {
  it("rejects an empty update payload", () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a single field update", () => {
    expect(
      updatePatientSchema.safeParse({ fullName: "New Name" }).success
    ).toBe(true);
  });

  it("allows address/notes to be explicitly nulled", () => {
    expect(
      updatePatientSchema.safeParse({ address: null, notes: null }).success
    ).toBe(true);
  });
});

describe("patientQuerySchema", () => {
  it("defaults page=1 and limit=10 when absent", () => {
    const result = patientQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("coerces string page/limit params", () => {
    const result = patientQuerySchema.parse({ page: "3", limit: "25" });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(25);
  });

  it("rejects a limit above 100", () => {
    expect(patientQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("transforms includeDeleted string to boolean", () => {
    expect(
      patientQuerySchema.parse({ includeDeleted: "true" }).includeDeleted
    ).toBe(true);
  });
});

describe("patientIdSchema", () => {
  it("rejects a non-UUID id", () => {
    expect(patientIdSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts a valid UUID", () => {
    expect(
      patientIdSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111" })
        .success
    ).toBe(true);
  });
});
