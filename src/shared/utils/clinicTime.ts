// src/shared/utils/clinicTime.ts
//
// Single source of truth for "what day / time is it at the clinic".
//
// The system serves clinics in Egypt only, so every "today" is computed on the
// Africa/Cairo calendar (CLINIC_TIMEZONE, default Africa/Cairo). Intl handles
// daylight saving automatically.
//
// Date-only columns (@db.Date, e.g. queueDate / appointmentDate / visitDate)
// are stored and compared as UTC midnight of the calendar date, so
// getClinicToday() returns the Cairo calendar date expressed as UTC midnight.
// Never derive "today" from `new Date().setUTCHours(0,0,0,0)` or
// `setHours(0,0,0,0)`: between 00:00 and 02:00/03:00 Cairo time those still
// point at yesterday.

import config from "../../config";

export interface ClinicNow {
  dateStr: string; // YYYY-MM-DD in clinic timezone
  minutes: number; // minutes since midnight in clinic timezone
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getClinicNow(now: Date = new Date()): ClinicNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.clinic.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// Today's calendar date at the clinic, as YYYY-MM-DD.
export function getClinicTodayStr(now: Date = new Date()): string {
  return getClinicNow(now).dateStr;
}

// Today's calendar date at the clinic, as UTC midnight (matches @db.Date).
export function getClinicToday(now: Date = new Date()): Date {
  return new Date(`${getClinicTodayStr(now)}T00:00:00.000Z`);
}

// YYYY-MM-DD shifted by a number of days (calendar arithmetic, DST-safe
// because it is done on UTC dates).
export function addDaysToDateStr(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T00:00:00.000Z`);
  return new Date(base.getTime() + days * DAY_MS).toISOString().split("T")[0];
}

// Last day of the month that contains dateStr, as YYYY-MM-DD.
export function endOfMonthDateStr(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(y, m, 0)).toISOString().split("T")[0];
}

// Milliseconds since midnight at the clinic for a real instant (e.g. checkedInAt).
// Use this to compare an instant with a wall-clock @db.Time value such as
// appointmentTime, which is stored as the clinic's local "HH:MM" written with
// a Z suffix. Comparing with getUTCHours() would be off by 2-3 hours.
export function getClinicTimeOfDayMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.clinic.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (
    get("hour") * 60 * 60 * 1000 +
    get("minute") * 60 * 1000 +
    get("second") * 1000 +
    date.getUTCMilliseconds()
  );
}
