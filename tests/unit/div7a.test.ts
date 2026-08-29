import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { beforeEach } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { calculateMinimumYearlyRepaymentCents } from "@/lib/domain/div7a/formula";
import { saveBenchmarkRate } from "@/lib/domain/div7a/rates";
import { createDiv7aLoan, getDiv7aLoanSummary, recordDiv7aRepayment } from "@/lib/domain/div7a/service";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM div7a_loans;");
  for (let year = 2017; year <= 2027; year += 1) {
    saveBenchmarkRate({
      incomeYear: `FY${year}-${String(year + 1).slice(-2)}`,
      rateText: "5.30%",
      sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
      retrievedAt: "2026-08-29",
      notes: "Unit-test fixture rate; production values are entered from the annual ATO table.",
    });
  }
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

test("does not report an origination-year shortfall but exposes the following-year gap", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Shortfall warning fixture",
    loanDate: "2026-07-04",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });

  expect(getDiv7aLoanSummary(loanId, "FY2026-27")).toMatchObject({
    repaymentStatus: "origination",
    minimumRepaymentCents: 0,
    actualRepaymentCents: 0,
    shortfallCents: 0,
  });
  const followingYear = getDiv7aLoanSummary(loanId, "FY2027-28");
  expect(followingYear.repaymentStatus).toBe("active");
  expect(followingYear.shortfallCents).toBe(followingYear.minimumRepaymentCents);
  expect(followingYear.shortfallCents).toBeGreaterThan(0);
});

test("recomputes each year from the prior year-end balance and derived remaining term", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Annual schedule test borrower",
    loanDate: "2017-05-15",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });

  const first = getDiv7aLoanSummary(loanId, "FY2017-18");
  recordDiv7aRepayment({ loanId, date: "2018-06-30", amountCents: 1_000_000 });
  const second = getDiv7aLoanSummary(loanId, "FY2018-19");
  const third = getDiv7aLoanSummary(loanId, "FY2019-20");

  expect(first.originalTermYears).toBe(7);
  expect(first.remainingTermYears).toBe(7);
  expect(first.balanceAtPreviousYearEndCents).toBe(10_000_000);
  expect(second.remainingTermYears).toBe(6);
  expect(second.balanceAtPreviousYearEndCents).toBe(9_530_000);
  expect(third.remainingTermYears).toBe(5);
  expect(third.balanceAtPreviousYearEndCents).toBe(10_035_090);
  expect(new Set([
    first.minimumRepaymentCents,
    second.minimumRepaymentCents,
    third.minimumRepaymentCents,
  ]).size).toBe(3);
});

test("rolls interest and recorded repayments into later-year balances", () => {
  const paidLoanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Paid schedule balance fixture",
    loanDate: "2017-05-15",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });
  const unpaidLoanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Unpaid schedule balance fixture",
    loanDate: "2017-05-15",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });

  const paidFirst = getDiv7aLoanSummary(paidLoanId, "FY2017-18");
  recordDiv7aRepayment({ loanId: paidLoanId, date: "2018-06-30", amountCents: paidFirst.minimumRepaymentCents! });
  const paidSecond = getDiv7aLoanSummary(paidLoanId, "FY2018-19");
  recordDiv7aRepayment({ loanId: paidLoanId, date: "2019-06-30", amountCents: paidSecond.minimumRepaymentCents! });
  const paidThird = getDiv7aLoanSummary(paidLoanId, "FY2019-20");
  const unpaidThird = getDiv7aLoanSummary(unpaidLoanId, "FY2019-20");

  expect(paidSecond.balanceAtPreviousYearEndCents).toBe(8_782_966);
  expect(paidThird.balanceAtPreviousYearEndCents).not.toBe(unpaidThird.balanceAtPreviousYearEndCents);
  expect(paidThird.minimumRepaymentCents).not.toBe(unpaidThird.minimumRepaymentCents);
});

test("marks a loan as expired when the final scheduled income year is reached", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Expired loan test borrower",
    loanDate: "2017-05-15",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });

  for (let year = 2017; year <= 2022; year += 1) {
    const incomeYear = `FY${year}-${String(year + 1).slice(-2)}`;
    const summary = getDiv7aLoanSummary(loanId, incomeYear);
    recordDiv7aRepayment({ loanId, date: `${year + 1}-06-30`, amountCents: summary.minimumRepaymentCents! });
  }

  expect(getDiv7aLoanSummary(loanId, "FY2023-24")).toMatchObject({
    isExpired: false,
    repaymentStatus: "active",
    minimumRepaymentCents: 1_747_034,
    remainingTermYears: 1,
  });
  expect(getDiv7aLoanSummary(loanId, "FY2024-25")).toMatchObject({
    isExpired: true,
    repaymentStatus: "expired",
    minimumRepaymentCents: 0,
    remainingTermYears: 0,
  });
});

test("repays the final scheduled year and closes the balance at zero", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Final repayment test borrower",
    loanDate: "2017-05-15",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });

  for (let year = 2017; year <= 2023; year += 1) {
    const incomeYear = `FY${year}-${String(year + 1).slice(-2)}`;
    const summary = getDiv7aLoanSummary(loanId, incomeYear);
    expect(summary.repaymentStatus).toBe("active");
    recordDiv7aRepayment({ loanId, date: `${year + 1}-06-30`, amountCents: summary.minimumRepaymentCents! });
  }

  const finalYear = getDiv7aLoanSummary(loanId, "FY2023-24");
  expect(finalYear).toMatchObject({
    repaymentStatus: "active",
    minimumRepaymentCents: 1_747_034,
    actualRepaymentCents: 1_747_034,
    closingBalanceCents: 0,
  });
});

test("keeps an unresolved balance visible after expiry instead of silently closing it", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Expired balance test borrower",
    loanDate: "2017-05-15",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });

  const expired = getDiv7aLoanSummary(loanId, "FY2024-25");

  expect(expired).toMatchObject({
    repaymentStatus: "expired",
    isExpired: true,
    minimumRepaymentCents: 0,
  });
  expect(expired.closingBalanceCents).toBeGreaterThan(0);
  expect(expired.unresolvedBalanceCents).toBe(expired.closingBalanceCents);
  expect(expired.expiryWarning).toContain("人工核对");
});
