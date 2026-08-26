import { expect, test } from "vitest";
import {
  formatAustralianDateInput,
  formatDueDate,
  parseAustralianDateInput,
} from "@/lib/time/melbourne";
import { nextMelbourneBusinessDay } from "@/lib/time/business-days";

test("formatDueDate uses DD MMM YYYY", () => {
  expect(formatDueDate("2026-07-15")).toBe("15 Jul 2026");
});

test("formatDueDate stays DD MMM YYYY when the process locale is en-US", () => {
  const originalLocale = process.env.LC_ALL;
  process.env.LC_ALL = "en-US";

  try {
    expect(formatDueDate("2026-07-15")).toBe("15 Jul 2026");
  } finally {
    if (originalLocale === undefined) {
      delete process.env.LC_ALL;
    } else {
      process.env.LC_ALL = originalLocale;
    }
  }
});

test("formats and parses the fixed Australian date input shape", () => {
  expect(formatAustralianDateInput("2026-07-15")).toBe("15/07/2026");
  expect(parseAustralianDateInput("15/07/2026")).toBe("2026-07-15");
  expect(parseAustralianDateInput("31/02/2026")).toBeNull();
});

test("moves a Saturday to the following Monday", () => {
  expect(nextMelbourneBusinessDay("2026-10-31")).toBe("2026-11-02");
});

test("moves a Victorian public holiday to the next business day", () => {
  expect(nextMelbourneBusinessDay("2026-11-03")).toBe("2026-11-04");
});

test("uses Australia/Melbourne across daylight-saving boundaries", () => {
  expect(nextMelbourneBusinessDay("2026-10-04")).toBe("2026-10-05");
});
