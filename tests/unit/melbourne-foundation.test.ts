import { expect, test } from "vitest";
import {
  formatDateOnly,
  formatMelbourneDateTime,
  MELBOURNE_TIME_ZONE,
  parseMelbourneDate,
} from "@/lib/time/melbourne";

test("exposes the required IANA timezone identifier", () => {
  expect(MELBOURNE_TIME_ZONE).toBe("Australia/Melbourne");
});

test("round-trips a Melbourne calendar date without UTC date comparison", () => {
  const date = parseMelbourneDate("2026-07-01");
  expect(formatDateOnly(date)).toBe("2026-07-01");
  expect(formatMelbourneDateTime(date)).toContain("01 Jul 2026");
});
