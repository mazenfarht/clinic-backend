import {
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  passwordComplexitySchema,
} from "../../../src/modules/auth/auth.validation";

describe("loginSchema", () => {
  it("accepts a valid email/password", () => {
    const result = loginSchema.safeParse({
      email: "doctor@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = loginSchema.safeParse({
      email: "doctor@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email", () => {
    const result = loginSchema.safeParse({ password: "password123" });
    expect(result.success).toBe(false);
  });
});

describe("refreshTokenSchema", () => {
  it("requires a non-empty refreshToken", () => {
    expect(refreshTokenSchema.safeParse({ refreshToken: "" }).success).toBe(
      false
    );
    expect(refreshTokenSchema.safeParse({ refreshToken: "abc" }).success).toBe(
      true
    );
  });
});

describe("passwordComplexitySchema", () => {
  it("rejects passwords missing uppercase/lowercase/number/special char", () => {
    expect(passwordComplexitySchema.safeParse("alllowercase1!").success).toBe(
      false
    );
    expect(passwordComplexitySchema.safeParse("ALLUPPERCASE1!").success).toBe(
      false
    );
    expect(passwordComplexitySchema.safeParse("NoNumbers!!").success).toBe(
      false
    );
    expect(passwordComplexitySchema.safeParse("NoSpecial123").success).toBe(
      false
    );
  });

  it("accepts a password meeting all complexity rules", () => {
    expect(passwordComplexitySchema.safeParse("Str0ng!Passw0rd").success).toBe(
      true
    );
  });
});

describe("changePasswordSchema", () => {
  const base = {
    currentPassword: "OldPassw0rd!",
    newPassword: "NewPassw0rd!",
    confirmPassword: "NewPassw0rd!",
  };

  it("accepts matching, complex, different passwords", () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects when confirmPassword does not match newPassword", () => {
    const result = changePasswordSchema.safeParse({
      ...base,
      confirmPassword: "Different1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when newPassword equals currentPassword", () => {
    const result = changePasswordSchema.safeParse({
      ...base,
      newPassword: base.currentPassword,
      confirmPassword: base.currentPassword,
    });
    expect(result.success).toBe(false);
  });
});
