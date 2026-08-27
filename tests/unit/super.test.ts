import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import { getSuperProgress, markSuperNoticeSubmitted, recordSuperContribution } from "@/lib/domain/super/service";
import { calculateSuperContributionDue } from "@/lib/domain/obligations/calculator";

beforeEach(() => {
  seedDatabase();
  const db = getRawDb();
  db.prepare("UPDATE settings SET value = '3000000' WHERE key = 'concessional_cap_cents'").run();
  db.exec("DELETE FROM super_contributions; DELETE FROM reminders; DELETE FROM obligations;");
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
});

test("uses the ATO-sourced configurable cap in integer cents", () => {
  const progress = getSuperProgress("self", "FY2026-27");
  expect(progress.capCents).toBe(3_000_000);
  expect(progress.capSourceUrl).toContain("ato.gov.au");
  expect(progress.capRetrievedAt).toBe("2026-08-27");
  expect(progress.contributedCents).toBe(0);
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
  getRawDb().prepare("UPDATE settings SET value = '' WHERE key = 'concessional_cap_cents'").run();
  expect(getSuperProgress("self", "FY2026-27")).toMatchObject({ capCents: null, capConfigured: false });
});
