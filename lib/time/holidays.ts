import type { DateOnly } from "@/lib/time/melbourne";

// Update this list every year from the official Victorian public holiday calendar.
// The 2027 AFL Grand Final Friday is intentionally not guessed until the official
// schedule is published.
export const VICTORIAN_PUBLIC_HOLIDAYS: readonly DateOnly[] = [
  "2026-01-01",
  "2026-01-26",
  "2026-03-09",
  "2026-04-03",
  "2026-04-04",
  "2026-04-05",
  "2026-04-06",
  "2026-04-25",
  "2026-06-08",
  "2026-09-25",
  "2026-11-03",
  "2026-12-25",
  "2026-12-26",
  "2026-12-28",
  "2027-01-01",
  "2027-01-26",
  "2027-03-08",
  "2027-03-26",
  "2027-03-27",
  "2027-03-28",
  "2027-03-29",
  "2027-04-25",
  "2027-06-14",
  "2027-11-02",
  "2027-12-25",
  "2027-12-26",
  "2027-12-27",
  "2027-12-28",
] as const;

export const VICTORIAN_PUBLIC_HOLIDAY_SET = new Set<string>(VICTORIAN_PUBLIC_HOLIDAYS);
