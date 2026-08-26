import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const MELBOURNE_TIME_ZONE = "Australia/Melbourne" as const;

export type DateOnly = `${number}-${number}-${number}`;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
