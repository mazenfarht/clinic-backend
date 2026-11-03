import { updateClinicSettingsSchema } from "../../../src/modules/clinic-settings/clinic-settings.validation";

const fullDay = { open: "09:00", close: "17:00", isOpen: true };
const fullWorkingHours = {
  sunday: fullDay,
  monday: fullDay,
  tuesday: fullDay,
  wednesday: fullDay,
  thursday: fullDay,
  friday: fullDay,
  saturday: { ...fullDay, isOpen: false },
};

describe("updateClinicSettingsSchema", () => {
  it("rejects an empty payload", () => {
    expect(updateClinicSettingsSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a single scalar field update", () => {
    expect(
      updateClinicSettingsSchema.safeParse({ maxPatientsPerDay: 80 }).success
    ).toBe(true);
  });

  it("rejects a workingHours object missing weekday keys", () => {
    expect(
      updateClinicSettingsSchema.safeParse({
        workingHours: { monday: fullDay },
      }).success
    ).toBe(false);
  });

  it("accepts a complete workingHours object", () => {
    expect(
      updateClinicSettingsSchema.safeParse({ workingHours: fullWorkingHours })
        .success
    ).toBe(true);
  });

  it("rejects appointmentDuration outside bounds", () => {
    expect(
      updateClinicSettingsSchema.safeParse({ appointmentDuration: 1 }).success
    ).toBe(false);
    expect(
      updateClinicSettingsSchema.safeParse({ appointmentDuration: 1000 })
        .success
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      updateClinicSettingsSchema.safeParse({ email: "not-an-email" }).success
    ).toBe(false);
  });
});
