import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { calculateBasDueDates } from "@/lib/domain/obligations/calculator";
import { ensureObligationsForFy } from "@/lib/domain/obligations/repository";
import { configurePublicHolidayYear, listPublicHolidayYears } from "@/lib/time/public-holidays";
import { buildPersonalTaxSummary, buildTrustDistributionDraft, saveTrustDistribution } from "@/lib/domain/annual";
import { GET as annualGet } from "@/app/api/annual/route";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM reminders; DELETE FROM bas_worksheets; DELETE FROM trust_distributions; DELETE FROM transactions; DELETE FROM obligations; DELETE FROM audit_log; DELETE FROM victorian_public_holidays WHERE year > 2027; DELETE FROM public_holiday_years WHERE year > 2027;");
});

test("FY2027-28 BAS dates are generated from the financial year and Q2 keeps its no-extension exception", () => {
  expect(calculateBasDueDates("FY2027-28", "Q1")).toMatchObject({ statutoryDue: "2027-10-28", effectiveDue: "2027-11-11" });
  expect(calculateBasDueDates("FY2027-28", "Q2")).toMatchObject({ statutoryDue: "2028-02-28", effectiveDue: null });
  expect(calculateBasDueDates("FY2027-28", "Q2").statutoryDue).not.toBe("2028-03-14");
});

test("an unconfigured holiday year leaves effective due unknown until that year is configured", () => {
  expect(listPublicHolidayYears().some((year) => year.year === 2028)).toBe(false);
  expect(calculateBasDueDates("FY2027-28", "Q2").effectiveDue).toBeNull();

  configurePublicHolidayYear({ year: 2028, confirmed: true, sourceUrl: "https://www.vic.gov.au/public-holidays-victoria", retrievedAt: "2026-08-30" });
  expect(calculateBasDueDates("FY2027-28", "Q2").effectiveDue).toBe("2028-02-28");
});

test("expanding the same financial year twice is idempotent and a new year gets its own BAS obligations", () => {
  const first = ensureObligationsForFy("FY2026-27");
  const second = ensureObligationsForFy("FY2026-27");
  const next = ensureObligationsForFy("FY2027-28");

  expect(first.filter((row) => row.ruleId === "bas_quarterly")).toHaveLength(12);
  expect(second.filter((row) => row.ruleId === "bas_quarterly")).toHaveLength(12);
  expect(next.filter((row) => row.ruleId === "bas_quarterly")).toHaveLength(12);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM obligations WHERE rule_id = 'bas_quarterly'").get()).toEqual({ count: 24 });
});

test("trust distributions appear in both individual annual summaries and reject company beneficiaries", async () => {
  const result = saveTrustDistribution({ trustEntityId: "boyun_trust", incomeYear: "FY2026-27", beneficiaryEntityId: "self", amountCents: 125_000, resolutionDate: "2027-06-29", status: "signed", sourceDescription: "Signed distribution resolution", enteredBy: "self" });
  saveTrustDistribution({ trustEntityId: "boyun_trust", incomeYear: "FY2026-27", beneficiaryEntityId: "spouse", amountCents: 125_000, resolutionDate: "2027-06-29", status: "signed", sourceDescription: "Signed distribution resolution", enteredBy: "self" });

  expect(result.amountCents).toBe(125_000);
  expect(buildTrustDistributionDraft("boyun_trust", "FY2026-27").beneficiaryAllocations).toEqual([
    expect.objectContaining({ beneficiary: "self", amountCents: 125_000, status: "signed" }),
    expect.objectContaining({ beneficiary: "spouse", amountCents: 125_000, status: "signed" }),
  ]);
  expect(buildPersonalTaxSummary("self", "FY2026-27").trustDistributionCents).toBe(125_000);
  expect(buildPersonalTaxSummary("spouse", "FY2026-27").trustDistributionCents).toBe(125_000);
  expect(getRawDb().prepare("SELECT beneficiary_entity_id, amount_cents FROM trust_distributions ORDER BY beneficiary_entity_id").all()).toEqual([
    { beneficiary_entity_id: "self", amount_cents: 125_000 },
    { beneficiary_entity_id: "spouse", amount_cents: 125_000 },
  ]);
  expect(() => saveTrustDistribution({ trustEntityId: "boyun_trust", incomeYear: "FY2026-27", beneficiaryEntityId: "boyun_co", amountCents: 1, resolutionDate: "2027-06-29", status: "proposed", sourceDescription: "invalid", enteredBy: "self" })).toThrow(/self.*spouse|受益人/);

  const response = await annualGet(new Request("http://localhost/api/annual?fy=FY2026-27&entityId=self"));
  const payload = await response.json() as { worksheets: Array<{ worksheet: { trustDistributionCents: number } }> };
  expect(payload.worksheets[0]?.worksheet.trustDistributionCents).toBe(125_000);
});

test("proposed trust distributions are labelled as unsigned in the personal summary", () => {
  saveTrustDistribution({ trustEntityId: "boyun_trust", incomeYear: "FY2026-27", beneficiaryEntityId: "self", amountCents: 125_000, resolutionDate: "2027-06-29", status: "proposed", sourceDescription: "Draft", enteredBy: "self" });

  expect(buildPersonalTaxSummary("self", "FY2026-27").trustDistributions).toEqual([
    expect.objectContaining({ amountCents: 125_000, status: "proposed", statusLabel: "拟议·未签署" }),
  ]);
});
