import { addDays } from "date-fns";
import { VICTORIAN_PUBLIC_HOLIDAY_SET } from "@/lib/time/holidays";
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
