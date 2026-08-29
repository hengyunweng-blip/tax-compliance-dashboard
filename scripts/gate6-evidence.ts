import { closeDatabase, getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { saveDiv7aOpeningBalance } from "@/lib/domain/div7a/opening-balances";
import { createDiv7aLoan, getDiv7aLoanSchedule, getDiv7aLoanSummary } from "@/lib/domain/div7a/service";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";

seedDatabase();
const db = getRawDb();
db.exec("DELETE FROM reminders; DELETE FROM bas_worksheets; DELETE FROM obligations; DELETE FROM opening_balances; DELETE FROM div7a_loans; DELETE FROM audit_log;");

const historicalLoanId = createDiv7aLoan({
  lenderEntityId: "boyun_co",
  borrower: "Gate 6 期初余额展示贷款",
  loanDate: "2020-01-15",
  principalCents: 10_000_000,
  termYears: 7,
  originalIncomeYear: "FY2019-20",
  securityType: "unsecured",
});
saveDiv7aOpeningBalance({
  loanId: historicalLoanId,
  balanceCents: 5_000_000,
  asOfDate: "2026-06-30",
  originalIncomeYear: "FY2019-20",
  originalTermYears: 7,
  securityType: "unsecured",
  agreementTermsStatus: "unknown",
  sourceDescription: "会计 FY2025–26 底稿（Gate 6 临时演练）",
  enteredBy: "gate6-evidence",
  enteredAt: "2026-08-29",
});

const missingRateLoanId = createDiv7aLoan({
  lenderEntityId: "yeeliving_co",
  borrower: "Gate 6 未配置利率展示贷款",
  loanDate: "2026-07-01",
  principalCents: 2_000_000,
  termYears: 7,
  originalIncomeYear: "FY2026-27",
  securityType: "unsecured",
});
db.prepare(`
  INSERT INTO obligations (rule_id, entity_id, period_label, scope_key, income_year, deadline_fy, statutory_due, effective_due, status)
  VALUES ('company_tax_return', 'boyun_co', 'FY2026-27', 'entity', 'FY2026-27', 'FY2027-28', '2028-02-28', '2028-02-28', 'todo')
`).run();
expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });

const historicalCurrent = getDiv7aLoanSummary(historicalLoanId, "FY2026-27");
const historicalSchedule = getDiv7aLoanSchedule(historicalLoanId, "FY2026-27");
const missingRateCurrent = getDiv7aLoanSummary(missingRateLoanId, "FY2027-28");
const agreementRows = db.prepare(`
  SELECT id, entity_id, period_label, scope_key, statutory_due, effective_due, status, notes
  FROM obligations WHERE rule_id = 'div7a_loan_agreement' ORDER BY scope_key
`).all();
const reminderSummary = db.prepare(`
  SELECT o.scope_key, COUNT(*) AS reminder_count,
    MIN(r.fire_at) AS first_fire_at, MAX(r.fire_at) AS last_fire_at
  FROM reminders r INNER JOIN obligations o ON o.id = r.obligation_id
  WHERE o.rule_id = 'div7a_loan_agreement'
  GROUP BY o.scope_key ORDER BY o.scope_key
`).all();
console.log(JSON.stringify({
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  historicalLoanId,
  missingRateLoanId,
  historicalCurrent,
  historicalSchedule,
  missingRateCurrent,
  agreementRows,
  reminderSummary,
}, null, 2));
closeDatabase();
