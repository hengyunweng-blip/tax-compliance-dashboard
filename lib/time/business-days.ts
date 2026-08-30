import { addDays } from "date-fns";
import { VICTORIAN_PUBLIC_HOLIDAY_SET } from "@/lib/time/holidays";
import { getConfiguredPublicHolidayDates, isPublicHolidayYearConfigured } from "@/lib/time/public-holidays";
import {
  formatDateOnly,
  MELBOURNE_TIME_ZONE,
  parseMelbourneDate,
  type DateOnly,
} from "@/lib/time/melbourne";
import { formatInTimeZone } from "date-fns-tz";

export function isMelbourneWeekend(date: DateOnly): boolean {
  const weekday = Number(formatInTimeZone(parseMelbourneDate(date), MELBOURNE_TIME_ZONE, "i"));
  return weekday >= 6;
}

export function isVictorianPublicHoliday(date: DateOnly): boolean {
  return VICTORIAN_PUBLIC_HOLIDAY_SET.has(date);
}

export function nextMelbourneBusinessDay(date: DateOnly): DateOnly {
  return adjustMelbourneBusinessDay(date, "forward");
}

export function previousMelbourneBusinessDay(date: DateOnly): DateOnly {
  return adjustMelbourneBusinessDay(date, "backward");
}

export function adjustMelbourneBusinessDay(date: DateOnly, direction: "forward" | "backward"): DateOnly {
  let candidate = date;
  const step = direction === "backward" ? -1 : 1;
  for (let attempts = 0; attempts < 370; attempts += 1) {
    if (!isMelbourneWeekend(candidate) && !isVictorianPublicHoliday(candidate)) {
      return candidate;
    }
    candidate = formatDateOnly(addDays(parseMelbourneDate(candidate), step));
  }
  throw new Error(`Unable to find a Melbourne business day ${direction === "backward" ? "before" : "after"} ${date}`);
}

/**
 * Obligation dates use the persisted Victorian calendar. A missing or
 * unconfirmed calendar is intentionally different from an empty holiday set:
 * the result is unknown until the user confirms that year's calendar.
 */
export function adjustConfiguredMelbourneBusinessDay(date: DateOnly, direction: "forward" | "backward"): DateOnly | null {
  const dates = new Set<string>();
  let year = Number(date.slice(0, 4));
  if (!isPublicHolidayYearConfigured(year)) return null;
  const step = direction === "backward" ? -1 : 1;
  let candidate = date;
  for (let attempts = 0; attempts < 370; attempts += 1) {
    year = Number(candidate.slice(0, 4));
    if (!isPublicHolidayYearConfigured(year)) return null;
    for (const holiday of getConfiguredPublicHolidayDates(year)) dates.add(holiday);
    if (!isMelbourneWeekend(candidate) && !dates.has(candidate)) return candidate;
    candidate = formatDateOnly(addDays(parseMelbourneDate(candidate), step));
  }
  return null;
}
