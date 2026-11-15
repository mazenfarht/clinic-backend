// The helper only needs the timezone from config; mock it so this spec is a
// pure unit test (no Prisma client / database).
jest.mock("../../../src/config", () => ({
  __esModule: true,
  default: { clinic: { timezone: "Africa/Cairo" } },
}));

import {
  addDaysToDateStr,
  endOfMonthDateStr,
  getClinicNow,
  getClinicTimeOfDayMs,
  getClinicToday,
  getClinicTodayStr,
} from "../../../src/shared/utils/clinicTime";

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

describe("getClinicTodayStr", () => {
  it("is already the next day in Cairo while UTC is still yesterday (winter, UTC+2)", () => {
    // 22:30 UTC on 13 Nov = 00:30 on 14 Nov in Cairo
    const instant = new Date("2026-11-13T22:30:00.000Z");
    expect(instant.toISOString().split("T")[0]).toBe("2026-11-13");
    expect(getClinicTodayStr(instant)).toBe("2026-11-14");
  });

  it("handles daylight saving time (summer, UTC+3)", () => {
    // 21:30 UTC on 15 Jul = 00:30 on 16 Jul in Cairo
    expect(getClinicTodayStr(new Date("2026-07-15T21:30:00.000Z"))).toBe(
      "2026-07-16"
    );
    // 20:30 UTC on 15 Jul = 23:30 on 15 Jul in Cairo (still the 15th)
    expect(getClinicTodayStr(new Date("2026-07-15T20:30:00.000Z"))).toBe(
      "2026-07-15"
    );
  });

  it("keeps the same day around midday", () => {
    expect(getClinicTodayStr(new Date("2026-11-14T10:00:00.000Z"))).toBe(
      "2026-11-14"
    );
  });
});

describe("getClinicToday", () => {
  it("returns the Cairo calendar date as UTC midnight (matches @db.Date)", () => {
    const d = getClinicToday(new Date("2026-11-13T22:30:00.000Z"));
    expect(d.toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });
});

describe("getClinicNow", () => {
  it("returns the date and minutes since midnight in Cairo", () => {
    const now = getClinicNow(new Date("2026-11-14T07:30:00.000Z")); // 09:30 Cairo
    expect(now.dateStr).toBe("2026-11-14");
    expect(now.minutes).toBe(9 * 60 + 30);
  });

  it("does not report hour 24 at Cairo midnight", () => {
    const now = getClinicNow(new Date("2026-11-13T22:00:00.000Z")); // 00:00 Cairo
    expect(now.dateStr).toBe("2026-11-14");
    expect(now.minutes).toBe(0);
  });
});

describe("addDaysToDateStr", () => {
  it("adds and subtracts days across month and year boundaries", () => {
    expect(addDaysToDateStr("2026-11-14", -29)).toBe("2026-10-16");
    expect(addDaysToDateStr("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateStr("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("endOfMonthDateStr", () => {
  it("returns the last day of the month", () => {
    expect(endOfMonthDateStr("2026-11-14")).toBe("2026-11-30");
    expect(endOfMonthDateStr("2026-12-05")).toBe("2026-12-31");
    expect(endOfMonthDateStr("2028-02-10")).toBe("2028-02-29"); // leap year
    expect(endOfMonthDateStr("2027-02-10")).toBe("2027-02-28");
  });
});

describe("getClinicTimeOfDayMs", () => {
  it("reads the time of day in Cairo, keeping milliseconds", () => {
    const ms = getClinicTimeOfDayMs(new Date("2026-11-14T07:30:00.123Z"));
    expect(ms).toBe(9 * HOUR + 30 * MIN + 123);
  });

  it("detects a late check-in against a wall-clock appointmentTime", () => {
    // appointmentTime is stored as local "10:00" written with a Z suffix.
    const appointmentTime = new Date("1970-01-01T10:00:00.000Z");
    const appointmentMs =
      appointmentTime.getUTCHours() * HOUR +
      appointmentTime.getUTCMinutes() * MIN;

    // Checked in at 11:00 Cairo (= 09:00 UTC): one hour LATE.
    const checkedInAt = new Date("2026-11-14T09:00:00.000Z");
    expect(getClinicTimeOfDayMs(checkedInAt)).toBeGreaterThan(appointmentMs);

    // The old UTC-based read wrongly said "on time" (09:00 < 10:00).
    const utcMs = checkedInAt.getUTCHours() * HOUR;
    expect(utcMs).toBeLessThan(appointmentMs);
  });

  it("treats an early check-in as on time", () => {
    const appointmentMs = 10 * HOUR;
    // 09:30 Cairo = 07:30 UTC
    const checkedInAt = new Date("2026-11-14T07:30:00.000Z");
    expect(getClinicTimeOfDayMs(checkedInAt)).toBeLessThan(appointmentMs);
  });
});
