// src/shared/utils/calendarDate.ts
//
// Strict YYYY-MM-DD validation.
//
// `new Date("2026-02-31")` does NOT fail: V8 silently rolls it over to
// 2026-03-03. A regex plus `!isNaN(new Date(x))` therefore accepts impossible
// dates and stores a different day than the one the caller sent. The helpers
// here round-trip the parsed parts and reject anything that does not survive.

export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real calendar date written as YYYY-MM-DD (leap years aware). */
export function isValidCalendarDate(value: string): boolean {
  if (typeof value !== "string" || !DATE_ONLY_REGEX.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (month < 1 || month > 12 || day < 1) return false;

  // setUTCFullYear avoids Date.UTC's "years 0-99 mean 1900-1999" quirk.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** UTC-midnight Date for a valid YYYY-MM-DD string, or null if it is invalid. */
export function parseCalendarDate(value: string): Date | null {
  if (!isValidCalendarDate(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}
