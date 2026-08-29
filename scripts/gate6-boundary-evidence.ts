import { closeDatabase, getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { saveBenchmarkRate } from "@/lib/domain/div7a/rates";
import { createDiv7aLoan, getDiv7aLoanSummary, recordDiv7aRepayment } from "@/lib/domain/div7a/service";

const ATO_RATE_URL = "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate";

seedDatabase();
const db = getRawDb();
db.exec("DELETE FROM div7a_loans; DELETE FROM div7a_benchmark_rates; DELETE FROM opening_balances; DELETE FROM audit_log;");
for (let year = 2017; year <= 2023; year += 1) {
  saveBenchmarkRate({
    incomeYear: `FY${year}-${String(year + 1).slice(-2)}`,
    rateText: "5.30%",
    sourceUrl: ATO_RATE_URL,
    retrievedAt: "2026-08-29",
    notes: "Boundary evidence fixture; the 2017–18 ATO calculator baseline uses 5.30%.",
  });
}

const loanId = createDiv7aLoan({
  lenderEntityId: "boyun_co",
  borrower: "Gate 6 repayment-boundary loan",
  loanDate: "2017-05-15",
  principalCents: 10_000_000,
  termYears: 7,
  originalIncomeYear: "FY2016-17",
  securityType: "unsecured",
});

for (let year = 2017; year <= 2023; year += 1) {
  const incomeYear = `FY${year}-${String(year + 1).slice(-2)}`;
  const summary = getDiv7aLoanSummary(loanId, incomeYear);
  if (summary.minimumRepaymentCents === null) throw new Error(`Missing minimum for ${incomeYear}`);
  recordDiv7aRepayment({ loanId, date: `${year + 1}-06-30`, amountCents: summary.minimumRepaymentCents });
}

const schedule = [
  ...Array.from({ length: 7 }, (_, index) => getDiv7aLoanSummary(loanId, `FY${2017 + index}-${String(2018 + index).slice(-2)}`)),
  getDiv7aLoanSummary(loanId, "FY2024-25"),
].map((row) => ({
  incomeYear: row.assessmentIncomeYear,
  repaymentStatus: row.repaymentStatus,
  openingBalanceCents: row.openingBalanceCents,
  interestCents: row.interestCents,
  minimumRepaymentCents: row.minimumRepaymentCents,
  actualRepaymentCents: row.actualRepaymentCents,
  closingBalanceCents: row.closingBalanceCents,
  remainingTermYears: row.remainingTermYears,
  unresolvedBalanceCents: row.unresolvedBalanceCents,
  expiryWarning: row.expiryWarning,
}));

console.log(JSON.stringify({ databasePath: process.env.DATABASE_PATH ?? "./data/app.db", loanId, schedule }, null, 2));
closeDatabase();
