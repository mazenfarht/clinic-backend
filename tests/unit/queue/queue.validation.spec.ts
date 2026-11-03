import {
  checkInSchema,
  reserveSlotSchema,
  queueQuerySchema,
  queueEntryIdSchema,
} from "../../../src/modules/queue/queue.validation";

describe("checkInSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      checkInSchema.safeParse({
        patientId: "11111111-1111-1111-1111-111111111111",
      }).success
    ).toBe(true);
  });

  it("rejects a non-UUID patientId", () => {
    expect(checkInSchema.safeParse({ patientId: "abc" }).success).toBe(false);
  });

  it("rejects a non-UUID appointmentId when provided", () => {
    expect(
      checkInSchema.safeParse({
        patientId: "11111111-1111-1111-1111-111111111111",
        appointmentId: "xyz",
      }).success
    ).toBe(false);
  });
});

describe("reserveSlotSchema", () => {
  it("accepts queueNumber within 1-3", () => {
    expect(
      reserveSlotSchema.safeParse({ reservedFor: "VIP", queueNumber: 2 })
        .success
    ).toBe(true);
  });

  it("rejects queueNumber above 3", () => {
    expect(
      reserveSlotSchema.safeParse({ reservedFor: "VIP", queueNumber: 4 })
        .success
    ).toBe(false);
  });

  it("rejects queueNumber below 1", () => {
    expect(
      reserveSlotSchema.safeParse({ reservedFor: "VIP", queueNumber: 0 })
        .success
    ).toBe(false);
  });

  it("requires a non-empty reservedFor", () => {
    expect(
      reserveSlotSchema.safeParse({ reservedFor: "", queueNumber: 1 }).success
    ).toBe(false);
  });
});

describe("queueQuerySchema", () => {
  it("defaults page=1 and limit=20", () => {
    const result = queueQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("rejects an invalid status", () => {
    expect(queueQuerySchema.safeParse({ status: "BOGUS" }).success).toBe(false);
  });
});

describe("queueEntryIdSchema", () => {
  it("rejects a non-UUID id", () => {
    expect(queueEntryIdSchema.safeParse({ id: "123" }).success).toBe(false);
  });
});
