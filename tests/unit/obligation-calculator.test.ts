import { expect, test } from "vitest";
import { ENTITY_SEEDS } from "@/lib/constants/entities";
import {
  calculateAnnualTaxDue,
  calculateBasDueDates,
  calculateLicenceWindowDue,
  calculateSuperContributionDue,
  calculateTrustDistributionDue,
} from "@/lib/domain/obligations/calculator";
import { expandObligations } from "@/lib/domain/obligations/expand";

test.each([
  ["Q1", "2026-10-28", "2026-11-11"],
  ["Q2", "2027-02-28", "2027-03-01"],
  ["Q3", "2027-04-28", "2027-05-12"],
  ["Q4", "2027-07-28", "2027-08-11"],
])("calculates FY2026-27 %s exactly", (quarter, statutoryDue, effectiveDue) => {
  expect(calculateBasDueDates("2026-27", quarter as "Q1" | "Q2" | "Q3" | "Q4")).toEqual({
    incomeYear: "FY2026-27",
    deadlineFy: "FY2026-27",
    statutoryDue,
    effectiveDue,
  });
});

test("does not apply the two-week self-lodge extension to Q2", () => {
  expect(calculateBasDueDates("2026-27", "Q2").effectiveDue).toBe("2027-03-01");
});

test("keeps the licence anniversary as the deadline and separates the window opening date", () => {
  expect(calculateLicenceWindowDue("2026-08-15", "2026-27")).toMatchObject({
    windowOpens: "2026-07-04",
    statutoryDue: "2026-08-15",
    effectiveDue: "2026-08-14",
  });
});

test("uses the previous business day for 30 June backward-adjusted obligations", () => {
  expect(calculateTrustDistributionDue("2029-06-30")).toMatchObject({
    statutoryDue: "2029-06-30",
    effectiveDue: "2029-06-29",
  });
  expect(calculateSuperContributionDue("2029-06-30")).toMatchObject({
    statutoryDue: "2029-06-30",
    effectiveDue: "2029-06-29",
  });
});

test("keeps annual income year separate from the deadline fiscal year", () => {
  expect(calculateAnnualTaxDue({ type: "trust" }, { fy: "2026-27" })).toMatchObject({
    incomeYear: "FY2025-26",
    deadlineFy: "FY2026-27",
    statutoryDue: "2026-10-31",
    effectiveDue: "2026-11-02",
  });
  expect(calculateAnnualTaxDue({ type: "individual" }, { fy: "2026-27" })).toMatchObject({
    incomeYear: "FY2025-26",
    deadlineFy: "FY2026-27",
    statutoryDue: "2026-10-31",
    effectiveDue: "2026-11-02",
  });
  expect(calculateAnnualTaxDue({ type: "company", priorYearReturnOutstanding: false }, { fy: "2026-27" })).toMatchObject({
    incomeYear: "FY2025-26",
    deadlineFy: "FY2026-27",
    statutoryDue: "2027-02-28",
    effectiveDue: "2027-03-01",
  });
  expect(calculateAnnualTaxDue({ type: "company", priorYearReturnOutstanding: true }, { fy: "2026-27" })).toMatchObject({
    incomeYear: "FY2025-26",
    deadlineFy: "FY2026-27",
    statutoryDue: "2026-10-31",
    effectiveDue: "2026-11-02",
  });
});

test("expands exactly twelve FY2026-27 BAS obligations for three GST companies", () => {
  const inputs = expandObligations({
    fy: "2026-27",
    entities: ENTITY_SEEDS.map((entity) => ({
      id: entity.id,
      type: entity.type,
      gstRegistered: entity.gstRegistered,
      acn: entity.type === "company" ? "123456789" : null,
      asicReviewDate: entity.type === "company" ? "2024-07-15" : null,
    })),
    licence: { anniversaryDate: "2026-08-15" },
    context: { priorYearReturnOutstanding: false },
  });

  const bas = inputs.filter((input) => input.ruleId === "bas_quarterly");
  expect(bas).toHaveLength(12);
  expect(bas.map((input) => [input.periodLabel, input.statutoryDue, input.effectiveDue])).toEqual([
    ["FY2026-27 Q1", "2026-10-28", "2026-11-11"],
    ["FY2026-27 Q2", "2027-02-28", "2027-03-01"],
    ["FY2026-27 Q3", "2027-04-28", "2027-05-12"],
    ["FY2026-27 Q4", "2027-07-28", "2027-08-11"],
    ["FY2026-27 Q1", "2026-10-28", "2026-11-11"],
    ["FY2026-27 Q2", "2027-02-28", "2027-03-01"],
    ["FY2026-27 Q3", "2027-04-28", "2027-05-12"],
    ["FY2026-27 Q4", "2027-07-28", "2027-08-11"],
    ["FY2026-27 Q1", "2026-10-28", "2026-11-11"],
    ["FY2026-27 Q2", "2027-02-28", "2027-03-01"],
    ["FY2026-27 Q3", "2027-04-28", "2027-05-12"],
    ["FY2026-27 Q4", "2027-07-28", "2027-08-11"],
  ]);
});

test("keeps an ASIC obligation blocked without inventing due dates", () => {
  const inputs = expandObligations({
    fy: "2026-27",
    entities: [{
      id: "yeeliving_co",
      type: "company",
      gstRegistered: false,
      acn: "234567890",
      asicReviewDate: null,
    }],
    licence: { anniversaryDate: null },
    context: { priorYearReturnOutstanding: false },
  });

  expect(inputs.find((input) => input.ruleId === "asic_annual_review")).toMatchObject({
    status: "blocked",
    statutoryDue: null,
    effectiveDue: null,
  });
});

test("blocks only the missing ASIC obligation, not BAS or company tax for the same entity", () => {
  const inputs = expandObligations({
    fy: "2026-27",
    entities: [
      {
        id: "boyun_co",
        type: "company",
        gstRegistered: true,
        acn: "123456789",
        asicReviewDate: "2026-07-15",
      },
      {
        id: "yeeliving_co",
        type: "company",
        gstRegistered: true,
        acn: null,
        asicReviewDate: null,
      },
    ],
    licence: { anniversaryDate: null },
    context: { priorYearReturnOutstanding: false },
  });

  const boyun = inputs.filter((input) => input.entityId === "boyun_co");
  const yeeliving = inputs.filter((input) => input.entityId === "yeeliving_co");
  const boyunBasAndTax = boyun.filter((input) => input.ruleId === "bas_quarterly" || input.ruleId === "company_tax_return");
  const yeelivingBasAndTax = yeeliving.filter((input) => input.ruleId === "bas_quarterly" || input.ruleId === "company_tax_return");

  expect(yeelivingBasAndTax).toHaveLength(5);
  expect(yeelivingBasAndTax.every((input) => input.status === "todo")).toBe(true);
  expect(yeelivingBasAndTax.map((input) => [input.ruleId, input.periodLabel, input.statutoryDue, input.effectiveDue]))
    .toEqual(boyunBasAndTax.map((input) => [input.ruleId, input.periodLabel, input.statutoryDue, input.effectiveDue]));
  expect(yeeliving.filter((input) => input.status === "blocked")).toEqual([
    expect.objectContaining({
      ruleId: "asic_annual_review",
      statutoryDue: null,
      effectiveDue: null,
    }),
  ]);
});
