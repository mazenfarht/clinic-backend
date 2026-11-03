import { createReceptionistSchema } from "../../../src/modules/users/users.validation";

describe("createReceptionistSchema", () => {
  it("accepts a valid payload", () => {
    const result = createReceptionistSchema.safeParse({
      email: "recep@example.com",
      password: "Str0ng!Passw0rd",
      fullName: "Reception Staff",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      createReceptionistSchema.safeParse({
        email: "bad-email",
        password: "Str0ng!Passw0rd",
        fullName: "Reception Staff",
      }).success
    ).toBe(false);
  });

  it("rejects a weak password", () => {
    expect(
      createReceptionistSchema.safeParse({
        email: "recep@example.com",
        password: "weak",
        fullName: "Reception Staff",
      }).success
    ).toBe(false);
  });

  it("rejects a full name shorter than 2 characters", () => {
    expect(
      createReceptionistSchema.safeParse({
        email: "recep@example.com",
        password: "Str0ng!Passw0rd",
        fullName: "A",
      }).success
    ).toBe(false);
  });
});
