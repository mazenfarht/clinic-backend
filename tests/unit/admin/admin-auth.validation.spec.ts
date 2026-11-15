import {
  adminLoginSchema,
  adminChangePasswordSchema,
} from "../../../src/modules/admin/auth/admin-auth.validation";

describe("adminLoginSchema", () => {
  it("trims and lowercases the email", () => {
    const out = adminLoginSchema.parse({
      email: "  Owner@Example.COM ",
      password: "x",
    });
    expect(out.email).toBe("owner@example.com");
  });

  it("rejects a missing or invalid email", () => {
    expect(adminLoginSchema.safeParse({ password: "x" }).success).toBe(false);
    expect(
      adminLoginSchema.safeParse({ email: "nope", password: "x" }).success
    ).toBe(false);
  });

  it("rejects an empty or oversized password", () => {
    expect(
      adminLoginSchema.safeParse({ email: "a@b.com", password: "" }).success
    ).toBe(false);
    expect(
      adminLoginSchema.safeParse({
        email: "a@b.com",
        password: "x".repeat(129),
      }).success
    ).toBe(false);
  });

  it("does not enforce complexity on login", () => {
    expect(
      adminLoginSchema.safeParse({ email: "a@b.com", password: "short" })
        .success
    ).toBe(true);
  });
});

describe("adminChangePasswordSchema", () => {
  const valid = {
    currentPassword: "Old!Passw0rd",
    newPassword: "N3w!Passw0rdXyz",
    confirmPassword: "N3w!Passw0rdXyz",
  };

  it("accepts a valid payload", () => {
    expect(adminChangePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a weak new password", () => {
    const r = adminChangePasswordSchema.safeParse({
      ...valid,
      newPassword: "weak",
      confirmPassword: "weak",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a mismatched confirmation", () => {
    const r = adminChangePasswordSchema.safeParse({
      ...valid,
      confirmPassword: "Different!Passw0rd1",
    });
    expect(r.success).toBe(false);
  });

  it("rejects reusing the current password", () => {
    const r = adminChangePasswordSchema.safeParse({
      currentPassword: valid.newPassword,
      newPassword: valid.newPassword,
      confirmPassword: valid.newPassword,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a password longer than 72 characters (bcrypt limit)", () => {
    const long = "Aa1!" + "x".repeat(70);
    const r = adminChangePasswordSchema.safeParse({
      currentPassword: valid.currentPassword,
      newPassword: long,
      confirmPassword: long,
    });
    expect(r.success).toBe(false);
  });
});
