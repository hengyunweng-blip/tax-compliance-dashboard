import { differenceInCalendarDays } from "date-fns";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { assertIntegerCents } from "@/lib/money";
import { calculateMinimumYearlyRepaymentCents } from "@/lib/domain/div7a/formula";
import { deriveFiscalPeriod } from "@/lib/ingest/transactions";
import { assertDateOnly, formatDateOnly, parseMelbourneDate, todayInMelbourne, type DateOnly } from "@/lib/time/melbourne";

type StoredRepayment = { date: DateOnly; amountCents: number };

export type Div7aLoan = {
  id: number;
  lenderEntityId: string;
  lenderEntityName: string;
  borrower: string;
  loanDate: DateOnly;
  loanIncomeYear: string;
  principalCents: number;
  /** Original contractual term persisted in div7a_loans.term_years. */
  originalTermYears: number;
  /** Backwards-compatible alias for the original contractual term. */
  termYears: number;
  benchmarkRate: string;
  repayments: StoredRepayment[];
  agreementSigned: boolean;
};

export type Div7aSummary = Div7aLoan & {
  assessmentIncomeYear: string;
  elapsedRepaymentYears: number;
  /** Derived remaining term for this assessment year, not the stored original term. */
  remainingTermYears: number;
  balanceAtPreviousYearEndCents: number;
  repaymentStatus: "origination" | "active" | "expired";
  isExpired: boolean;
  minimumRepaymentCents: number;
  actualRepaymentCents: number;
  shortfallCents: number;
  repaymentDue: DateOnly | null;
  daysUntilRepaymentDue: number | null;
};

function normalizeFy(value: string) {
  const normalized = value.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid income year: ${value}`);
  return `FY${normalized}`;
}

function incomeYearStart(value: string) {
  return Number(normalizeFy(value).slice(2, 6));
}

function repaymentSchedule(loanIncomeYear: string, assessmentIncomeYear: string, originalTermYears: number) {
  const elapsedRepaymentYears = incomeYearStart(assessmentIncomeYear) - incomeYearStart(loanIncomeYear);
  if (elapsedRepaymentYears <= 0) {
    return {
      elapsedRepaymentYears: 0,
      remainingTermYears: originalTermYears,
      repaymentStatus: "origination" as const,
      isExpired: false,
    };
  }
  if (elapsedRepaymentYears > originalTermYears) {
    return {
      elapsedRepaymentYears,
      remainingTermYears: 0,
      repaymentStatus: "expired" as const,
      isExpired: true,
    };
  }
  return {
    elapsedRepaymentYears,
    remainingTermYears: originalTermYears - elapsedRepaymentYears + 1,
    repaymentStatus: "active" as const,
    isExpired: false,
  };
}

function parseDate(value: string): DateOnly {
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) throw new Error(`Invalid date: ${value}`);
  return date;
}

function readRepayments(value: string): StoredRepayment[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as { date?: unknown; amountCents?: unknown };
      if (typeof candidate.date !== "string" || typeof candidate.amountCents !== "number" || !Number.isSafeInteger(candidate.amountCents)) return [];
      return [{ date: parseDate(candidate.date), amountCents: candidate.amountCents }];
    });
  } catch {
    return [];
  }
}

function mapLoan(row: {
  id: number;
  lender_entity_id: string;
  lender_entity_name: string;
  borrower: string;
  loan_date: DateOnly;
  principal_cents: number;
  term_years: number;
  benchmark_rate: number;
  repayments_json: string;
  agreement_signed: number;
}): Div7aLoan {
  assertIntegerCents(row.principal_cents);
  return {
    id: row.id,
    lenderEntityId: row.lender_entity_id,
    lenderEntityName: row.lender_entity_name,
    borrower: row.borrower,
    loanDate: row.loan_date,
    loanIncomeYear: normalizeFy(deriveFiscalPeriod(row.loan_date).fy),
    principalCents: row.principal_cents,
    originalTermYears: row.term_years,
    termYears: row.term_years,
    benchmarkRate: String(row.benchmark_rate),
    repayments: readRepayments(row.repayments_json),
    agreementSigned: Boolean(row.agreement_signed),
  };
}

function balanceAtPreviousYearEndCents(loan: Div7aLoan, assessmentIncomeYear: string) {
  const assessmentStart = incomeYearStart(assessmentIncomeYear);
  let balance = loan.principalCents;
  for (const repayment of loan.repayments) {
    if (incomeYearStart(deriveFiscalPeriod(repayment.date).fy) < assessmentStart) {
      balance = Math.max(0, balance - repayment.amountCents);
    }
  }
  assertIntegerCents(balance);
  return balance;
}

export function listDiv7aLoans(): Div7aLoan[] {
  runMigrations();
  const rows = getRawDb().prepare(`
    SELECT l.id, l.lender_entity_id, e.name AS lender_entity_name, l.borrower, l.loan_date,
      l.principal_cents, l.term_years, l.benchmark_rate, l.repayments_json, l.agreement_signed
    FROM div7a_loans l
    INNER JOIN entities e ON e.id = l.lender_entity_id
    ORDER BY l.loan_date, l.id
  `).all() as Array<{
    id: number;
    lender_entity_id: string;
    lender_entity_name: string;
    borrower: string;
    loan_date: DateOnly;
    principal_cents: number;
    term_years: number;
    benchmark_rate: number;
    repayments_json: string;
    agreement_signed: number;
  }>;
  return rows.map(mapLoan);
}

export function createDiv7aLoan(input: {
  lenderEntityId: string;
  borrower: string;
  loanDate: string;
  principalCents: number;
  termYears: number;
  benchmarkRate: string;
  agreementSigned?: boolean;
}) {
  runMigrations();
  const loanDate = parseDate(input.loanDate);
  assertIntegerCents(input.principalCents);
  if (input.principalCents <= 0) throw new Error("Principal must be positive");
  if (!input.borrower.trim()) throw new Error("Borrower is required");
  if (!Number.isSafeInteger(input.termYears) || input.termYears < 1 || input.termYears > 25) throw new Error("Term must be between 1 and 25 years");
  // Validate the manually entered rate without deriving it from the loan year.
  calculateMinimumYearlyRepaymentCents({
    principalCents: input.principalCents,
    benchmarkRate: input.benchmarkRate,
    remainingTermYears: input.termYears,
    loanIncomeYear: normalizeFy(deriveFiscalPeriod(loanDate).fy),
    assessmentIncomeYear: normalizeFy(deriveFiscalPeriod(loanDate).fy),
  });
  const entity = getRawDb().prepare("SELECT id FROM entities WHERE id = ? AND type = 'company' AND active = 1").get(input.lenderEntityId);
  if (!entity) throw new Error("Lender entity must be an active company");
  const result = getRawDb().prepare(`
    INSERT INTO div7a_loans (lender_entity_id, borrower, loan_date, principal_cents, term_years, benchmark_rate, min_repayment_fy_cents, repayments_json, agreement_signed)
    VALUES (?, ?, ?, ?, ?, ?, 0, '[]', ?)
  `).run(input.lenderEntityId, input.borrower.trim(), loanDate, input.principalCents, input.termYears, Number(input.benchmarkRate.replace(/%$/, "")) / (input.benchmarkRate.trim().endsWith("%") ? 100 : 1), Number(input.agreementSigned ?? false));
  return Number(result.lastInsertRowid);
}

export function recordDiv7aRepayment(input: { loanId: number; date: string; amountCents: number }) {
  runMigrations();
  assertIntegerCents(input.amountCents);
  if (input.amountCents < 0) throw new Error("Repayment cannot be negative");
  const date = parseDate(input.date);
  const db = getRawDb();
  const row = db.prepare("SELECT repayments_json FROM div7a_loans WHERE id = ?").get(input.loanId) as { repayments_json: string } | undefined;
  if (!row) throw new Error(`Div 7A loan not found: ${input.loanId}`);
  const repayments = readRepayments(row.repayments_json);
  repayments.push({ date, amountCents: input.amountCents });
  db.prepare("UPDATE div7a_loans SET repayments_json = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(repayments), input.loanId);
}

export function getDiv7aLoanSummary(loanId: number, assessmentIncomeYear: string): Div7aSummary {
  runMigrations();
  const row = getRawDb().prepare(`
    SELECT l.id, l.lender_entity_id, e.name AS lender_entity_name, l.borrower, l.loan_date,
      l.principal_cents, l.term_years, l.benchmark_rate, l.repayments_json, l.agreement_signed
    FROM div7a_loans l INNER JOIN entities e ON e.id = l.lender_entity_id WHERE l.id = ?
  `).get(loanId) as {
    id: number;
    lender_entity_id: string;
    lender_entity_name: string;
    borrower: string;
    loan_date: DateOnly;
    principal_cents: number;
    term_years: number;
    benchmark_rate: number;
    repayments_json: string;
    agreement_signed: number;
  } | undefined;
  if (!row) throw new Error(`Div 7A loan not found: ${loanId}`);
  const loan = mapLoan(row);
  const normalizedAssessment = normalizeFy(assessmentIncomeYear);
  const schedule = repaymentSchedule(loan.loanIncomeYear, normalizedAssessment, loan.originalTermYears);
  const balanceAtPreviousYearEnd = balanceAtPreviousYearEndCents(loan, normalizedAssessment);
  const minimumRepaymentCents = schedule.repaymentStatus === "active" && balanceAtPreviousYearEnd > 0
    ? calculateMinimumYearlyRepaymentCents({
      principalCents: balanceAtPreviousYearEnd,
      benchmarkRate: loan.benchmarkRate,
      remainingTermYears: schedule.remainingTermYears,
      loanIncomeYear: loan.loanIncomeYear,
      assessmentIncomeYear: normalizedAssessment,
    })
    : 0;
  const actualRepaymentCents = loan.repayments
    .filter((repayment) => normalizeFy(deriveFiscalPeriod(repayment.date).fy) === normalizedAssessment)
    .reduce((total, repayment) => total + repayment.amountCents, 0);
  assertIntegerCents(actualRepaymentCents);
  const shortfallCents = Math.max(0, minimumRepaymentCents - actualRepaymentCents);
  assertIntegerCents(shortfallCents);
  const startYear = incomeYearStart(normalizedAssessment);
  const repaymentDue = schedule.isExpired ? null : `${startYear + 1}-06-30` as DateOnly;
  const daysUntilRepaymentDue = repaymentDue
    ? differenceInCalendarDays(parseMelbourneDate(repaymentDue), parseMelbourneDate(todayInMelbourne()))
    : null;
  return {
    ...loan,
    assessmentIncomeYear: normalizedAssessment,
    ...schedule,
    balanceAtPreviousYearEndCents: balanceAtPreviousYearEnd,
    minimumRepaymentCents,
    actualRepaymentCents,
    shortfallCents,
    repaymentDue,
    daysUntilRepaymentDue,
  };
}
