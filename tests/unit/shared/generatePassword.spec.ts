import { generatePassword } from "../../../src/shared/utils/generatePassword";
import { passwordComplexitySchema } from "../../../src/modules/auth/auth.validation";

describe("generatePassword", () => {
  it("always satisfies the password complexity rules", () => {
    for (let i = 0; i < 2000; i++) {
      const pw = generatePassword();
      expect(passwordComplexitySchema.safeParse(pw).success).toBe(true);
    }
  });

  it("has the requested length (default 16)", () => {
    expect(generatePassword()).toHaveLength(16);
    expect(generatePassword(24)).toHaveLength(24);
  });

  it("refuses to generate a short password", () => {
    expect(() => generatePassword(8)).toThrow();
    expect(() => generatePassword(11)).toThrow();
  });

  it("never uses look-alike characters", () => {
    for (let i = 0; i < 500; i++) {
      expect(generatePassword()).not.toMatch(/[0OIl1]/);
    }
  });

  it("produces different passwords every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generatePassword());
    expect(seen.size).toBe(1000);
  });
});
