import {
  createVisitSchema,
  updateVisitSchema,
  visitQuerySchema,
  visitIdSchema,
  patientIdParamSchema,
} from "../../../src/modules/visits/visit.validation";

describe("createVisitSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      createVisitSchema.safeParse({
        patientId: "11111111-1111-1111-1111-111111111111",
      }).success
    ).toBe(true);
  });

  it("rejects an empty chiefComplaint string", () => {
    expect(
      createVisitSchema.safeParse({
        patientId: "11111111-1111-1111-1111-111111111111",
        chiefComplaint: "",
      }).success
    ).toBe(false);
  });

  it("rejects a malformed visitDate", () => {
    expect(
      createVisitSchema.safeParse({
        patientId: "11111111-1111-1111-1111-111111111111",
        visitDate: "15-01-2026",
      }).success
    ).toBe(false);
  });
});

describe("updateVisitSchema", () => {
  it("rejects an empty payload", () => {
    expect(updateVisitSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a followUpDate in the past", () => {
    expect(
      updateVisitSchema.safeParse({ followUpDate: "2000-01-01" }).success
    ).toBe(false);
  });

  it("accepts a followUpDate in the future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    expect(
      updateVisitSchema.safeParse({
        followUpDate: future.toISOString().split("T")[0],
      }).success
    ).toBe(true);
  });

  it("allows followUpDate to be explicitly nulled", () => {
    expect(updateVisitSchema.safeParse({ followUpDate: null }).success).toBe(
      true
    );
  });
});

describe("visitQuerySchema", () => {
  it("defaults sortBy=visitDate and sortOrder=desc", () => {
    const result = visitQuerySchema.parse({});
    expect(result.sortBy).toBe("visitDate");
    expect(result.sortOrder).toBe("desc");
  });

  it("rejects an invalid sortBy value", () => {
    expect(visitQuerySchema.safeParse({ sortBy: "bogus" }).success).toBe(false);
  });
});

describe("visitIdSchema / patientIdParamSchema", () => {
  it("reject non-UUID values", () => {
    expect(visitIdSchema.safeParse({ id: "abc" }).success).toBe(false);
    expect(patientIdParamSchema.safeParse({ patientId: "abc" }).success).toBe(
      false
    );
  });
});
