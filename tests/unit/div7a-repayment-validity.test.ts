import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createDiv7aLoan, getDiv7aLoanSummary, recordDiv7aRepayment, reviewDiv7aRepayment } from "@/lib/domain/div7a/service";
import { saveBenchmarkRate } from "@/lib/domain/div7a/rates";
import { createTransaction } from "@/lib/ingest/transactions";

const ATO_RATE_URL = "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM transactions; DELETE FROM div7a_loans; DELETE FROM div7a_benchmark_rates; DELETE FROM audit_log;");
  saveBenchmarkRate({ incomeYear: "FY2026-27", rateText: "8.77%", sourceUrl: ATO_RATE_URL, retrievedAt: "2026-08-29" });
});

function expenseAccountId() {
  return (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' AND code = '500'").get() as { id: number }).id;
}

function createPriorYearLoan() {
  return createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Director borrower",
    loanDate: "2025-07-01",
    originalIncomeYear: "FY2025-26",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "5.30%",
  });
}

test("flags a repayment when an equal related company expense follows in the configured window", () => {
  const loanId = createPriorYearLoan();
  const repayment = recordDiv7aRepayment({ loanId, date: "2027-06-30", amountCents: 100_000 });
  createTransaction({
    entityId: "boyun_co",
    date: "2027-07-01",
    description: "New director draw after repayment",
    counterparty: "Director borrower",
    accountId: expenseAccountId(),
    gstCode: "NO_GST",
    amountCents: -100_000,
    gstCents: 0,
  });

  const summary = getDiv7aLoanSummary(loanId, "FY2026-27");

  expect(repayment.repaymentId).toBeTruthy();
  expect(summary.repaymentValidityRisks).toHaveLength(1);
  expect(summary.repaymentValidityRisks[0]).toMatchObject({
    repaymentId: repayment.repaymentId,
    repaymentDate: "2027-06-30",
    reviewStatus: "unreviewed",
  });
  expect(summary.repaymentValidityRisks[0].message).toContain("还款有效性存疑 · 请核对 s109R");
  expect(summary.recordedRepaymentCents).toBe(100_000);
  expect(summary.actualRepaymentCents).toBe(0);
});

test("does not flag a repayment when no related borrowing follows", () => {
  const loanId = createPriorYearLoan();
  recordDiv7aRepayment({ loanId, date: "2027-06-30", amountCents: 100_000 });

  const summary = getDiv7aLoanSummary(loanId, "FY2026-27");

  expect(summary.repaymentValidityRisks).toEqual([]);
  expect(summary.actualRepaymentCents).toBe(100_000);
});

test("user review determines whether a flagged repayment is counted and writes an audit entry", () => {
  const loanId = createPriorYearLoan();
  const repayment = recordDiv7aRepayment({ loanId, date: "2027-06-30", amountCents: 100_000 });
  createTransaction({
    entityId: "boyun_co",
    date: "2027-07-01",
    description: "New director draw after repayment",
    counterparty: "Director borrower",
    accountId: expenseAccountId(),
    gstCode: "NO_GST",
    amountCents: -100_000,
    gstCents: 0,
  });

  reviewDiv7aRepayment({ loanId, repaymentId: repayment.repaymentId, decision: "confirmed_valid" });

  const summary = getDiv7aLoanSummary(loanId, "FY2026-27");
  expect(summary.actualRepaymentCents).toBe(100_000);
  expect(getRawDb().prepare("SELECT target_type, target_id, to_status FROM audit_log WHERE target_type = 'div7a_repayment'").get()).toEqual({
    target_type: "div7a_repayment",
    target_id: repayment.repaymentId,
    to_status: "confirmed_valid",
  });
});

