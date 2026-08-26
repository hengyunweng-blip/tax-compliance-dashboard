import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const MELBOURNE_TIME_ZONE = "Australia/Melbourne" as const;

export type DateOnly = `${number}-${number}-${number}`;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DUE_DATE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function assertDateOnly(value: string): asserts value is DateOnly {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new Error(`Invalid date-only value: ${value}`);
  }
}

export function parseMelbourneDate(date: DateOnly): Date {
  assertDateOnly(date);
  return fromZonedTime(`${date}T12:00:00`, MELBOURNE_TIME_ZONE);
}

export function formatDateOnly(date: Date): DateOnly {
  return formatInTimeZone(date, MELBOURNE_TIME_ZONE, "yyyy-MM-dd") as DateOnly;
}

export function todayInMelbourne(now = new Date()): DateOnly {
  return formatDateOnly(now);
}

export function formatMelbourneDateTime(date: Date): string {
  return formatInTimeZone(date, MELBOURNE_TIME_ZONE, "dd MMM yyyy HH:mm");
}

export function formatDueDate(date: DateOnly): string {
  assertDateOnly(date);
  const [year, month, day] = date.split("-");
  const monthName = DUE_DATE_MONTHS[Number(month) - 1];
  if (!monthName) {
    throw new Error(`Invalid date-only value: ${date}`);
  }
  return `${day} ${monthName} ${year}`;
}

export function formatAustralianDateInput(date: DateOnly | null): string {
  if (!date) {
    return "";
  }
  assertDateOnly(date);
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function parseAustralianDateInput(value: string): DateOnly | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const candidate = `${year}-${month}-${day}` as DateOnly;
  try {
    const parsed = parseMelbourneDate(candidate);
    return formatDateOnly(parsed) === candidate ? candidate : null;
  } catch {
    return null;
  }
}
