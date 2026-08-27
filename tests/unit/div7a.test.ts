import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { beforeEach } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { calculateMinimumYearlyRepaymentCents } from "@/lib/domain/div7a/formula";
import { createDiv7aLoan, getDiv7aLoanSummary } from "@/lib/domain/div7a/service";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM div7a_loans;");
});

type OfficialBaseline = {
  sourceUrl: string;
  retrievedAt: string;
  retrievedAtTimezone: string;
  loanIncomeYear: string;
  principalCents: number;
  benchmarkRate: string;
  termYears: number;
  assessmentIncomeYear: string;
  minimumRepaymentCents: number;
};

const officialBaseline = JSON.parse(fs.readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/div7a/ato-baseline.json"),
  "utf8",
)) as OfficialBaseline;

// Official ATO Division 7A calculator result from
// https://www.ato.gov.au/calculators-and-tools/division-7a-calculator-and-decision-tool?page=1,
// entered/read on 27 Aug 2026 (Australia/Melbourne), not an expected value
// calculated by this test suite.
test("matches the official ATO calculator output in integer cents", () => {
  expect(officialBaseline.sourceUrl).toContain("ato.gov.au/calculators-and-tools/division-7a-calculator");
  expect(officialBaseline.retrievedAt).toBe("2026-08-27");
  expect(calculateMinimumYearlyRepaymentCents({
    principalCents: officialBaseline.principalCents,
    benchmarkRate: officialBaseline.benchmarkRate,
    remainingTermYears: officialBaseline.termYears,
    loanIncomeYear: officialBaseline.loanIncomeYear,
    assessmentIncomeYear: officialBaseline.assessmentIncomeYear,
  })).toBe(officialBaseline.minimumRepaymentCents);
});

test("supports a 25-year secured term and never returns fractional cents", () => {
  const result = calculateMinimumYearlyRepaymentCents({
    principalCents: 10_000_000,
    benchmarkRate: "0.053",
    remainingTermYears: 25,
    loanIncomeYear: "2016-17",
    assessmentIncomeYear: "2017-18",
  });
  expect(Number.isSafeInteger(result)).toBe(true);
  expect(result).toBeGreaterThan(0);
});

test("does not require a minimum repayment in the loan origination income year", () => {
  expect(calculateMinimumYearlyRepaymentCents({
    principalCents: 10_000_000,
    benchmarkRate: "0.053",
    remainingTermYears: 7,
    loanIncomeYear: "2026-27",
    assessmentIncomeYear: "2026-27",
  })).toBe(0);
});

test("starts the repayment schedule in the next income year", () => {
  expect(calculateMinimumYearlyRepaymentCents({
    principalCents: 10_000_000,
    benchmarkRate: "0.053",
    remainingTermYears: 7,
    loanIncomeYear: "2026-27",
    assessmentIncomeYear: "2027-28",
  })).toBeGreaterThan(0);
});

test("loan summary has no origination-year minimum and starts in the following year", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Gate 5 test borrower",
    loanDate: "2026-07-04",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });
  expect(getDiv7aLoanSummary(loanId, "FY2026-27").minimumRepaymentCents).toBe(0);
  expect(getDiv7aLoanSummary(loanId, "FY2027-28").minimumRepaymentCents).toBeGreaterThan(0);
});
