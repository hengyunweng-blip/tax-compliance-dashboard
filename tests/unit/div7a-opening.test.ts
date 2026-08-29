import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { calculateAnnualInterestCents, calculateMinimumYearlyRepaymentCents } from "@/lib/domain/div7a/formula";
import { saveBenchmarkRate } from "@/lib/domain/div7a/rates";
import { createDiv7aLoan, getDiv7aLoanSummary } from "@/lib/domain/div7a/service";
import { saveDiv7aOpeningBalance } from "@/lib/domain/div7a/opening-balances";

const ATO_RATE_URL = "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM div7a_loans; DELETE FROM div7a_benchmark_rates; DELETE FROM opening_balances; DELETE FROM audit_log;");
});

function saveRate(incomeYear: string, rateText: string) {
  saveBenchmarkRate({ incomeYear, rateText, sourceUrl: ATO_RATE_URL, retrievedAt: "2026-08-29" });
}

function createHistoricalLoan() {
  return createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Opening balance fixture",
    loanDate: "2020-01-15",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "0.053",
  });
}

test("requires a 30 June 2026 opening balance for a pre-cutover loan", () => {
  const loanId = createHistoricalLoan();
  saveRate("FY2026-27", "8.77%");

  const summary = getDiv7aLoanSummary(loanId, "FY2026-27");

  expect(summary.repaymentStatus).toBe("manual_review");
  expect(summary.openingBalanceCents).toBeNull();
  expect(summary.interestCents).toBeNull();
  expect(summary.minimumRepaymentCents).toBeNull();
  expect(summary.closingBalanceCents).toBeNull();
  expect(summary.unresolvedReason).toContain("期初余额未配置");
});

test("uses the recorded cutover balance and original term for FY2026-27", () => {
  const loanId = createHistoricalLoan();
  saveRate("FY2026-27", "8.77%");
  saveDiv7aOpeningBalance({
    loanId,
    balanceCents: 5_000_000,
    asOfDate: "2026-06-30",
    originalIncomeYear: "FY2019-20",
    originalTermYears: 7,
    securityType: "unsecured",
    agreementTermsStatus: "compliant",
    sourceDescription: "会计 FY2025–26 底稿",
    enteredBy: "self",
    enteredAt: "2026-08-29",
  });

  const summary = getDiv7aLoanSummary(loanId, "FY2026-27");

  expect(summary.loanIncomeYear).toBe("FY2019-20");
  expect(summary.originalTermYears).toBe(7);
  expect(summary.remainingTermYears).toBe(1);
  expect(summary.openingBalanceCents).toBe(5_000_000);
  expect(summary.interestCents).toBe(calculateAnnualInterestCents(5_000_000, "8.77%"));
  expect(summary.minimumRepaymentCents).toBe(calculateMinimumYearlyRepaymentCents({
    principalCents: 5_000_000,
    benchmarkRate: "8.77%",
    remainingTermYears: 1,
    loanIncomeYear: "FY2019-20",
    assessmentIncomeYear: "FY2026-27",
  }));
  expect(getRawDb().prepare("SELECT amount_cents, as_of_date, source_description FROM opening_balances WHERE reference_id = ?").get(`loan:${loanId}`)).toMatchObject({
    amount_cents: 5_000_000,
    as_of_date: "2026-06-30",
    source_description: "会计 FY2025–26 底稿",
  });
  expect(getRawDb().prepare("SELECT target_type, target_id FROM audit_log WHERE target_type = 'div7a_loan_opening_balance'").get()).toEqual({
    target_type: "div7a_loan_opening_balance",
    target_id: String(loanId),
  });
});

test("does not use the legacy loan benchmark rate when an annual rate is configured", () => {
  const loanId = createHistoricalLoan();
  saveRate("FY2026-27", "8.77%");
  saveDiv7aOpeningBalance({
    loanId,
    balanceCents: 5_000_000,
    asOfDate: "2026-06-30",
    originalIncomeYear: "FY2019-20",
    originalTermYears: 7,
    securityType: "unsecured",
    agreementTermsStatus: "compliant",
    sourceDescription: "会计 FY2025–26 底稿",
    enteredBy: "self",
    enteredAt: "2026-08-29",
  });

  expect(getDiv7aLoanSummary(loanId, "FY2026-27").interestCents).toBe(calculateAnnualInterestCents(5_000_000, "8.77%"));
});
