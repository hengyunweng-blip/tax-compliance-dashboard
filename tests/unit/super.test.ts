import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import { getSuperProgress, markSuperNoticeSubmitted, recordSuperContribution } from "@/lib/domain/super/service";
import { calculateSuperContributionDue } from "@/lib/domain/obligations/calculator";

beforeEach(() => {
  seedDatabase();
  const db = getRawDb();
  db.exec("DELETE FROM super_contributions; DELETE FROM reminders; DELETE FROM obligations;");
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
});

test("uses the ATO-sourced cap for each income year in integer cents", () => {
  const priorYear = getSuperProgress("self", "FY2025-26");
  expect(priorYear.capCents).toBe(3_000_000);
  expect(priorYear.nonConcessionalCapCents).toBe(12_000_000);
  expect(priorYear.capSourceUrl).toContain("ato.gov.au");
  expect(priorYear.capRetrievedAt).toBe("2026-08-29");

  const currentYear = getSuperProgress("self", "FY2026-27");
  expect(currentYear.capCents).toBe(3_250_000);
  expect(currentYear.nonConcessionalCapCents).toBe(13_000_000);
  expect(currentYear.nonConcessionalCapSourceUrl).toContain("non-concessional-contributions-cap");
  expect(currentYear.nonConcessionalCapRetrievedAt).toBe("2026-08-29");
  expect(currentYear.contributedCents).toBe(0);
});

test("payment and notice are independent tasks", () => {
  recordSuperContribution({ person: "self", fy: "FY2026-27", amountCents: 1_000_000, paidAt: "2027-06-29" });
  const beforeNotice = getSuperProgress("self", "FY2026-27");
  expect(beforeNotice.paymentComplete).toBe(true);
  expect(beforeNotice.noticeComplete).toBe(false);

  markSuperNoticeSubmitted({ person: "self", fy: "FY2026-27", submittedAt: "2027-07-01" });
  const afterNotice = getSuperProgress("self", "FY2026-27");
  expect(afterNotice.paymentComplete).toBe(true);
  expect(afterNotice.noticeComplete).toBe(true);
});

test("expands separate contribution and notice obligations", () => {
  const rows = getRawDb().prepare("SELECT rule_id, status FROM obligations WHERE entity_id = 'self' AND rule_id IN ('super_contribution', 'super_notice') ORDER BY rule_id").all();
  expect(rows).toEqual([
    { rule_id: "super_contribution", status: "todo" },
    { rule_id: "super_notice", status: "todo" },
  ]);
});

test("revalidates backward payment timing so a Saturday 30 June stays in June", () => {
  expect(calculateSuperContributionDue("2029-06-30", "backward").effectiveDue).toBe("2029-06-29");
});

test("shows an explicit unconfigured state when the cap setting is blank", () => {
  getRawDb().prepare("DELETE FROM super_caps WHERE income_year = '2026-27'").run();
  expect(getSuperProgress("self", "FY2026-27")).toMatchObject({
    capCents: null,
    nonConcessionalCapCents: null,
    capConfigured: false,
  });
});
