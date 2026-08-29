import { differenceInCalendarDays } from "date-fns";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { assertIntegerCents } from "@/lib/money";
import { calculateAnnualInterestCents, calculateMinimumYearlyRepaymentCents } from "@/lib/domain/div7a/formula";
import { getBenchmarkRateForIncomeYear } from "@/lib/domain/div7a/rates";
import { DIV7A_CUTOVER_DATE, getDiv7aOpeningBalance, type AgreementTermsStatus, type SecurityType } from "@/lib/domain/div7a/opening-balances";
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
  /** Legacy rate retained for migration/display diagnostics only. */
  benchmarkRate: string;
  legacyBenchmarkRate: string;
  repayments: StoredRepayment[];
  agreementSigned: boolean;
  agreementSignedAt: DateOnly | null;
  agreementDocumentId: number | null;
  agreementRateText: string | null;
  agreementTermsStatus: AgreementTermsStatus;
  securityType: SecurityType;
};

export type Div7aSummary = Div7aLoan & {
  assessmentIncomeYear: string;
  elapsedRepaymentYears: number;
  /** Derived remaining term for this assessment year, not the stored original term. */
  remainingTermYears: number | null;
  /** Opening balance for the assessment income year. */
  openingBalanceCents: number | null;
  balanceAtPreviousYearEndCents: number | null;
  /** Interest for the assessment income year at the manually entered rate. */
  interestCents: number | null;
  repaymentStatus: "origination" | "active" | "expired" | "manual_review";
  isExpired: boolean;
  minimumRepaymentCents: number | null;
  actualRepaymentCents: number | null;
  /** Closing balance after current-year interest and recorded repayments. */
  closingBalanceCents: number | null;
  /** Non-null when the scheduled term ended with an unresolved balance. */
  unresolvedBalanceCents: number | null;
  /** Manual-review warning for an expired loan that still has a balance. */
  expiryWarning: string | null;
  shortfallCents: number | null;
  benchmarkRateText: string | null;
  benchmarkRateSourceUrl: string | null;
  benchmarkRateRetrievedAt: string | null;
  unresolvedReason: string | null;
  repaymentDue: DateOnly | null;
  daysUntilRepaymentDue: number | null;
};

export type Div7aLoanView = Div7aSummary & {
  schedule: Div7aSummary[];
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
  // The seven-year term is counted from the first repayment income year.
  // The seventh repayment income year is still active; expiry begins in the
  // following income year.
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
  original_income_year: string | null;
  security_type: string;
  agreement_signed_at: DateOnly | null;
  agreement_document_id: number | null;
  agreement_rate_text: string | null;
  agreement_terms_status: string;
}): Div7aLoan {
  assertIntegerCents(row.principal_cents);
  const securityType = row.security_type as SecurityType;
  const agreementTermsStatus = row.agreement_terms_status as AgreementTermsStatus;
  if (!["unsecured", "registered_mortgage", "unknown"].includes(securityType)) throw new Error(`Invalid security type: ${row.security_type}`);
  if (!["unknown", "compliant", "not_compliant", "needs_review"].includes(agreementTermsStatus)) throw new Error(`Invalid agreement terms status: ${row.agreement_terms_status}`);
  return {
    id: row.id,
    lenderEntityId: row.lender_entity_id,
    lenderEntityName: row.lender_entity_name,
    borrower: row.borrower,
    loanDate: row.loan_date,
    loanIncomeYear: row.original_income_year ? normalizeFy(row.original_income_year) : normalizeFy(deriveFiscalPeriod(row.loan_date).fy),
    principalCents: row.principal_cents,
    originalTermYears: row.term_years,
    termYears: row.term_years,
    benchmarkRate: String(row.benchmark_rate),
    legacyBenchmarkRate: String(row.benchmark_rate),
    repayments: readRepayments(row.repayments_json),
    agreementSigned: Boolean(row.agreement_signed),
    agreementSignedAt: row.agreement_signed_at,
    agreementDocumentId: row.agreement_document_id,
    agreementRateText: row.agreement_rate_text,
    agreementTermsStatus,
    securityType,
  };
}

function incomeYearForStart(year: number) {
  return `FY${year}-${String(year + 1).slice(-2)}`;
}

function actualRepaymentCentsForIncomeYear(loan: Div7aLoan, incomeYear: string) {
  const normalizedIncomeYear = normalizeFy(incomeYear);
  let total = 0;
  for (const repayment of loan.repayments) {
    if (normalizeFy(deriveFiscalPeriod(repayment.date).fy) !== normalizedIncomeYear) continue;
    assertIntegerCents(repayment.amountCents);
    total += repayment.amountCents;
    assertIntegerCents(total);
  }
  return total;
}

type RollForwardResult = {
  balanceCents: number | null;
  missingReason: string | null;
};

function currentYearRate(incomeYear: string) {
  return getBenchmarkRateForIncomeYear(incomeYear);
}

function balanceAtPreviousYearEndCents(loan: Div7aLoan, assessmentIncomeYear: string): RollForwardResult {
  const assessmentStart = incomeYearStart(assessmentIncomeYear);
  const loanStart = incomeYearStart(loan.loanIncomeYear);
  if (assessmentStart <= loanStart) return { balanceCents: loan.principalCents, missingReason: null };

  let startYear = loanStart;
  let balance = loan.principalCents;
  if (loanStart < incomeYearStart("FY2026-27") && assessmentStart >= incomeYearStart("FY2026-27")) {
    const opening = getDiv7aOpeningBalance(loan.id);
    if (!opening) {
      return { balanceCents: null, missingReason: "无法判断 / 期初余额未配置（需要 30 Jun 2026 会计 FY2025–26 底稿余额）" };
    }
    balance = opening.balanceCents;
    startYear = incomeYearStart("FY2026-27");
  }

  // The origination year has no minimum repayment schedule. For a cutover
  // loan, the opening balance replaces all pre-cutover history; only years
  // from FY2026-27 onward are rolled forward.
  for (let year = startYear; year < assessmentStart; year += 1) {
    const incomeYear = incomeYearForStart(year);
    const isOriginationYear = year === loanStart;
    const isWithinTerm = year > loanStart && year <= loanStart + loan.originalTermYears;
    const rate = isOriginationYear || !isWithinTerm ? null : currentYearRate(incomeYear);
    if (isWithinTerm && !rate) {
      return { balanceCents: null, missingReason: `无法判断 / ${incomeYear} 基准利率未配置` };
    }
    const interestCents = rate ? calculateAnnualInterestCents(balance, rate.rateText) : 0;
    const actualRepaymentCents = actualRepaymentCentsForIncomeYear(loan, incomeYear);
    balance = Math.max(0, balance + interestCents - actualRepaymentCents);
    assertIntegerCents(balance);
  }
  assertIntegerCents(balance);
  return { balanceCents: balance, missingReason: null };
}

export function listDiv7aLoans(): Div7aLoan[] {
  runMigrations();
  const rows = getRawDb().prepare(`
    SELECT l.id, l.lender_entity_id, e.name AS lender_entity_name, l.borrower, l.loan_date,
      l.principal_cents, l.term_years, l.benchmark_rate, l.repayments_json, l.agreement_signed,
      l.original_income_year, l.security_type, l.agreement_signed_at, l.agreement_document_id,
      l.agreement_rate_text, l.agreement_terms_status
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
    original_income_year: string | null;
    security_type: string;
    agreement_signed_at: DateOnly | null;
    agreement_document_id: number | null;
    agreement_rate_text: string | null;
    agreement_terms_status: string;
  }>;
  return rows.map(mapLoan);
}

export function createDiv7aLoan(input: {
  lenderEntityId: string;
  borrower: string;
  loanDate: string;
  principalCents: number;
  termYears: number;
  benchmarkRate?: string;
  agreementSigned?: boolean;
  originalIncomeYear?: string;
  securityType?: SecurityType;
  agreementSignedAt?: string | null;
  agreementDocumentId?: number | null;
  agreementRateText?: string | null;
  agreementTermsStatus?: AgreementTermsStatus;
}) {
  runMigrations();
  const loanDate = parseDate(input.loanDate);
  assertIntegerCents(input.principalCents);
  if (input.principalCents <= 0) throw new Error("Principal must be positive");
  if (!input.borrower.trim()) throw new Error("Borrower is required");
  if (!Number.isSafeInteger(input.termYears) || input.termYears < 1 || input.termYears > 25) throw new Error("Term must be between 1 and 25 years");
  const legacyBenchmarkRate = input.benchmarkRate?.trim() || "0";
  // This value is retained only for legacy rows. Annual calculations use the
  // div7a_benchmark_rates table and never fall back to this column.
  calculateMinimumYearlyRepaymentCents({
    principalCents: input.principalCents,
    benchmarkRate: legacyBenchmarkRate,
    remainingTermYears: input.termYears,
    loanIncomeYear: normalizeFy(deriveFiscalPeriod(loanDate).fy),
    assessmentIncomeYear: normalizeFy(deriveFiscalPeriod(loanDate).fy),
  });
  const entity = getRawDb().prepare("SELECT id FROM entities WHERE id = ? AND type = 'company' AND active = 1").get(input.lenderEntityId);
  if (!entity) throw new Error("Lender entity must be an active company");
  const originalIncomeYear = input.originalIncomeYear
    ? normalizeFy(input.originalIncomeYear)
    : normalizeFy(deriveFiscalPeriod(loanDate).fy);
  const securityType = input.securityType ?? "unknown";
  const agreementTermsStatus = input.agreementTermsStatus ?? "unknown";
  if (!["unsecured", "registered_mortgage", "unknown"].includes(securityType)) throw new Error(`Invalid security type: ${securityType}`);
  if (!["unknown", "compliant", "not_compliant", "needs_review"].includes(agreementTermsStatus)) throw new Error(`Invalid agreement terms status: ${agreementTermsStatus}`);
  const agreementSignedAt = input.agreementSignedAt ? parseDate(input.agreementSignedAt) : null;
  if (input.agreementDocumentId !== undefined && input.agreementDocumentId !== null && (!Number.isSafeInteger(input.agreementDocumentId) || input.agreementDocumentId <= 0)) throw new Error("Agreement document id is invalid");
  const result = getRawDb().prepare(`
    INSERT INTO div7a_loans (
      lender_entity_id, borrower, loan_date, principal_cents, term_years, benchmark_rate,
      min_repayment_fy_cents, repayments_json, agreement_signed, original_income_year,
      security_type, agreement_signed_at, agreement_document_id, agreement_terms_status
      , agreement_rate_text
    ) VALUES (?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.lenderEntityId,
    input.borrower.trim(),
    loanDate,
    input.principalCents,
    input.termYears,
    Number(legacyBenchmarkRate.replace(/%$/, "")) / (legacyBenchmarkRate.endsWith("%") ? 100 : 1),
    Number(input.agreementSigned ?? false),
    originalIncomeYear,
    securityType,
    agreementSignedAt,
    input.agreementDocumentId ?? null,
    agreementTermsStatus,
    input.agreementRateText?.trim() || null,
  );
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
      l.principal_cents, l.term_years, l.benchmark_rate, l.repayments_json, l.agreement_signed,
      l.original_income_year, l.security_type, l.agreement_signed_at, l.agreement_document_id,
      l.agreement_rate_text, l.agreement_terms_status
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
    original_income_year: string | null;
    security_type: string;
    agreement_signed_at: DateOnly | null;
    agreement_document_id: number | null;
    agreement_rate_text: string | null;
    agreement_terms_status: string;
  } | undefined;
  if (!row) throw new Error(`Div 7A loan not found: ${loanId}`);
  const loan = mapLoan(row);
  const normalizedAssessment = normalizeFy(assessmentIncomeYear);
  const schedule = repaymentSchedule(loan.loanIncomeYear, normalizedAssessment, loan.originalTermYears);
  const actualRepaymentCents = actualRepaymentCentsForIncomeYear(loan, normalizedAssessment);
  const openingResult = balanceAtPreviousYearEndCents(loan, normalizedAssessment);
  const activeRate = schedule.repaymentStatus === "active" ? currentYearRate(normalizedAssessment) : null;
  const missingReason = openingResult.missingReason ?? (schedule.repaymentStatus === "active" && !activeRate
    ? `无法判断 / ${normalizedAssessment} 基准利率未配置`
    : null);
  const benchmarkRateText = activeRate?.rateText ?? null;
  const openingBalanceCents = openingResult.balanceCents;
  const interestCents = missingReason || openingBalanceCents === null
    ? null
    : schedule.repaymentStatus === "active"
      ? calculateAnnualInterestCents(openingBalanceCents, activeRate?.rateText ?? "0")
      : 0;
  const closingBalanceCents = missingReason || openingBalanceCents === null || interestCents === null
    ? null
    : Math.max(0, openingBalanceCents + interestCents - actualRepaymentCents);
  if (closingBalanceCents !== null) assertIntegerCents(closingBalanceCents);
  const minimumRepaymentCents = missingReason || openingBalanceCents === null
    ? null
    : schedule.repaymentStatus === "active" && openingBalanceCents > 0
      ? calculateMinimumYearlyRepaymentCents({
        principalCents: openingBalanceCents,
        benchmarkRate: activeRate?.rateText ?? "0",
        remainingTermYears: schedule.remainingTermYears,
        loanIncomeYear: loan.loanIncomeYear,
        assessmentIncomeYear: normalizedAssessment,
      })
      : 0;
  const shortfallCents = minimumRepaymentCents === null ? null : Math.max(0, minimumRepaymentCents - actualRepaymentCents);
  if (shortfallCents !== null) assertIntegerCents(shortfallCents);
  const unresolvedBalanceCents = schedule.isExpired && closingBalanceCents !== null && closingBalanceCents > 0 ? closingBalanceCents : null;
  const expiryWarning = unresolvedBalanceCents === null
    ? null
    : `贷款已到期但仍有 ${unresolvedBalanceCents} 分未清偿余额，请人工核对清偿及税务处理。系统不会自动创建分红记录。`;
  const startYear = incomeYearStart(normalizedAssessment);
  const repaymentDue = schedule.repaymentStatus === "active" ? `${startYear + 1}-06-30` as DateOnly : null;
  const daysUntilRepaymentDue = repaymentDue
    ? differenceInCalendarDays(parseMelbourneDate(repaymentDue), parseMelbourneDate(todayInMelbourne()))
    : null;
  return {
    ...loan,
    benchmarkRate: benchmarkRateText ?? "未配置",
    assessmentIncomeYear: normalizedAssessment,
    elapsedRepaymentYears: schedule.elapsedRepaymentYears,
    remainingTermYears: schedule.remainingTermYears,
    repaymentStatus: missingReason ? "manual_review" : schedule.repaymentStatus,
    isExpired: schedule.isExpired,
    openingBalanceCents,
    balanceAtPreviousYearEndCents: openingBalanceCents,
    interestCents,
    minimumRepaymentCents,
    actualRepaymentCents,
    closingBalanceCents,
    unresolvedBalanceCents,
    expiryWarning,
    shortfallCents,
    benchmarkRateText,
    benchmarkRateSourceUrl: activeRate?.sourceUrl ?? null,
    benchmarkRateRetrievedAt: activeRate?.retrievedAt ?? null,
    unresolvedReason: missingReason,
    repaymentDue,
    daysUntilRepaymentDue,
  };
}

/**
 * Returns the visible year-by-year schedule beginning at the requested
 * income year and ending one year after the contractual term, so an
 * unresolved post-term balance remains visible as an explicit expired row.
 */
export function getDiv7aLoanSchedule(loanId: number, fromIncomeYear = "FY2026-27", throughIncomeYear?: string): Div7aSummary[] {
  const loan = listDiv7aLoans().find((candidate) => candidate.id === loanId);
  if (!loan) throw new Error(`Div 7A loan not found: ${loanId}`);
  const startYear = incomeYearStart(normalizeFy(fromIncomeYear));
  const expiryYear = incomeYearStart(loan.loanIncomeYear) + loan.originalTermYears + 1;
  const endYear = throughIncomeYear ? Math.max(startYear, incomeYearStart(normalizeFy(throughIncomeYear))) : Math.max(startYear, expiryYear);
  const rows: Div7aSummary[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    rows.push(getDiv7aLoanSummary(loanId, incomeYearForStart(year)));
  }
  return rows;
}
