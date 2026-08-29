import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { assertIntegerCents } from "@/lib/money";
import { assertDateOnly, formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export const DIV7A_CUTOVER_DATE: DateOnly = "2026-06-30";

export type SecurityType = "unsecured" | "registered_mortgage" | "unknown";
export type AgreementTermsStatus = "unknown" | "compliant" | "not_compliant" | "needs_review";

export type Div7aOpeningBalance = {
  id: number;
  loanId: number;
  entityId: string;
  balanceCents: number;
  asOfDate: DateOnly;
  originalIncomeYear: string;
  originalTermYears: number;
  securityType: SecurityType;
  agreementTermsStatus: AgreementTermsStatus;
  agreementRateText: string | null;
  sourceDescription: string;
  enteredBy: string;
  enteredAt: string;
  notes: string | null;
};

function normalizeIncomeYear(value: string) {
  const normalized = value.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid income year: ${value}`);
  return `FY${normalized}`;
}

function normalizeDate(value: string, label: string): DateOnly {
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) throw new Error(`${label}无效: ${value}`);
  return date;
}

function normalizeEnteredAt(value: string) {
  const trimmed = value.trim();
  const datePart = trimmed.slice(0, 10);
  normalizeDate(datePart, "期初余额录入日期");
  return trimmed;
}

function assertSecurityType(value: string): asserts value is SecurityType {
  if (!(["unsecured", "registered_mortgage", "unknown"] as const).includes(value as SecurityType)) {
    throw new Error(`Invalid security type: ${value}`);
  }
}

function assertAgreementTermsStatus(value: string): asserts value is AgreementTermsStatus {
  if (!(["unknown", "compliant", "not_compliant", "needs_review"] as const).includes(value as AgreementTermsStatus)) {
    throw new Error(`Invalid agreement terms status: ${value}`);
  }
}

function mapRow(row: {
  id: number;
  loan_id: number;
  entity_id: string;
  amount_cents: number;
  as_of_date: DateOnly;
  original_income_year: string;
  original_term_years: number;
  security_type: string;
  agreement_rate_text: string | null;
  agreement_terms_status: string;
  source_description: string;
  entered_by: string;
  entered_at: string;
  notes: string | null;
}): Div7aOpeningBalance {
  assertIntegerCents(row.amount_cents);
  assertSecurityType(row.security_type);
  assertAgreementTermsStatus(row.agreement_terms_status);
  return {
    id: row.id,
    loanId: row.loan_id,
    entityId: row.entity_id,
    balanceCents: row.amount_cents,
    asOfDate: normalizeDate(row.as_of_date, "期初余额切换日"),
    originalIncomeYear: normalizeIncomeYear(row.original_income_year),
    originalTermYears: row.original_term_years,
    securityType: row.security_type,
    agreementTermsStatus: row.agreement_terms_status,
    agreementRateText: row.agreement_rate_text,
    sourceDescription: row.source_description,
    enteredBy: row.entered_by,
    enteredAt: row.entered_at,
    notes: row.notes,
  };
}

export function getDiv7aOpeningBalance(loanId: number): Div7aOpeningBalance | null {
  runMigrations();
  const row = getRawDb().prepare(`
    SELECT ob.id, ob.entity_id, ob.amount_cents, ob.as_of_date,
      l.original_income_year, l.term_years AS original_term_years, l.security_type,
      l.agreement_rate_text, l.agreement_terms_status, ob.source_description, ob.entered_by, ob.entered_at, ob.notes
    FROM opening_balances ob
    INNER JOIN div7a_loans l ON l.id = CAST(SUBSTR(ob.reference_id, 6) AS INTEGER)
    WHERE ob.category = 'div7a_loan_balance' AND ob.reference_type = 'loan' AND ob.reference_id = ? AND ob.as_of_date = ?
  `).get(`loan:${loanId}`, DIV7A_CUTOVER_DATE) as {
    id: number;
    entity_id: string;
    amount_cents: number;
    as_of_date: DateOnly;
    original_income_year: string;
    original_term_years: number;
    security_type: string;
    agreement_rate_text: string | null;
    agreement_terms_status: string;
    source_description: string;
    entered_by: string;
    entered_at: string;
    notes: string | null;
  } | undefined;
  return row ? mapRow({ ...row, loan_id: loanId }) : null;
}

export function saveDiv7aOpeningBalance(input: {
  loanId: number;
  balanceCents: number;
  asOfDate: string;
  originalIncomeYear: string;
  originalTermYears: number;
  securityType: SecurityType;
  agreementTermsStatus: AgreementTermsStatus;
  agreementRateText?: string | null;
  agreementSignedAt?: string | null;
  agreementDocumentId?: number | null;
  sourceDescription: string;
  enteredBy: string;
  enteredAt: string;
  notes?: string | null;
}) {
  runMigrations();
  assertIntegerCents(input.balanceCents);
  if (input.balanceCents < 0) throw new Error("Opening balance cannot be negative");
  const asOfDate = normalizeDate(input.asOfDate, "期初余额切换日");
  if (asOfDate !== DIV7A_CUTOVER_DATE) throw new Error(`Div 7A 期初余额切换日必须为 ${DIV7A_CUTOVER_DATE}`);
  const originalIncomeYear = normalizeIncomeYear(input.originalIncomeYear);
  if (!Number.isSafeInteger(input.originalTermYears) || input.originalTermYears < 1 || input.originalTermYears > 25) {
    throw new Error("Original term must be an integer between 1 and 25 years");
  }
  assertSecurityType(input.securityType);
  assertAgreementTermsStatus(input.agreementTermsStatus);
  const sourceDescription = input.sourceDescription.trim();
  const enteredBy = input.enteredBy.trim();
  if (!sourceDescription || !enteredBy) throw new Error("期初余额来源说明和录入人均为必填");
  const enteredAt = normalizeEnteredAt(input.enteredAt);
  const agreementSignedAt = input.agreementSignedAt ? normalizeDate(input.agreementSignedAt, "协议签署日") : null;
  if (input.agreementDocumentId !== undefined && input.agreementDocumentId !== null && (!Number.isSafeInteger(input.agreementDocumentId) || input.agreementDocumentId <= 0)) {
    throw new Error("Agreement document id is invalid");
  }
  const db = getRawDb();
  const loan = db.prepare("SELECT id, lender_entity_id FROM div7a_loans WHERE id = ?").get(input.loanId) as { id: number; lender_entity_id: string } | undefined;
  if (!loan) throw new Error(`Div 7A loan not found: ${input.loanId}`);

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO opening_balances (
        entity_id, category, reference_type, reference_id, as_of_date, amount_cents, value_text,
        source_description, entered_by, entered_at, notes
      ) VALUES (?, 'div7a_loan_balance', 'loan', ?, ?, ?, NULL, ?, ?, ?, ?)
      ON CONFLICT(category, reference_id, as_of_date) DO UPDATE SET
        entity_id = excluded.entity_id,
        amount_cents = excluded.amount_cents,
        source_description = excluded.source_description,
        entered_by = excluded.entered_by,
        entered_at = excluded.entered_at,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).run(
      loan.lender_entity_id,
      `loan:${input.loanId}`,
      asOfDate,
      input.balanceCents,
      sourceDescription,
      enteredBy,
      enteredAt,
      input.notes?.trim() || null,
    );
    db.prepare(`
      UPDATE div7a_loans
      SET original_income_year = ?, term_years = ?, security_type = ?,
        agreement_signed_at = ?, agreement_document_id = ?, agreement_rate_text = ?, agreement_terms_status = ?,
        agreement_signed = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      originalIncomeYear,
      input.originalTermYears,
      input.securityType,
      agreementSignedAt,
      input.agreementDocumentId ?? null,
      input.agreementRateText?.trim() || null,
      input.agreementTermsStatus,
      Number(Boolean(agreementSignedAt && input.agreementTermsStatus === "compliant")),
      input.loanId,
    );
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, reason, metadata_json)
      VALUES (?, ?, ?, ?)
    `).run(
      "div7a_loan_opening_balance",
      String(input.loanId),
      "录入/更新 30 Jun 2026 Div 7A 期初余额",
      JSON.stringify({
        balanceCents: input.balanceCents,
        asOfDate,
        originalIncomeYear,
        originalTermYears: input.originalTermYears,
        securityType: input.securityType,
        agreementTermsStatus: input.agreementTermsStatus,
        sourceDescription,
        enteredBy,
        enteredAt,
      }),
    );
  });
  transaction();
  return getDiv7aOpeningBalance(input.loanId);
}

export function saveDiv7aAgreement(input: {
  loanId: number;
  agreementSignedAt: string | null;
  agreementDocumentId: number | null;
  agreementRateText: string | null;
  agreementTermsStatus: AgreementTermsStatus;
  securityType: SecurityType;
}) {
  runMigrations();
  assertSecurityType(input.securityType);
  assertAgreementTermsStatus(input.agreementTermsStatus);
  const agreementSignedAt = input.agreementSignedAt ? normalizeDate(input.agreementSignedAt, "协议签署日") : null;
  if (input.agreementDocumentId !== null && (!Number.isSafeInteger(input.agreementDocumentId) || input.agreementDocumentId <= 0)) {
    throw new Error("Agreement document id is invalid");
  }
  const agreementRateText = input.agreementRateText?.trim() || null;
  const db = getRawDb();
  if (!db.prepare("SELECT id FROM div7a_loans WHERE id = ?").get(input.loanId)) {
    throw new Error(`Div 7A loan not found: ${input.loanId}`);
  }
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE div7a_loans
      SET agreement_signed_at = ?, agreement_document_id = ?, agreement_rate_text = ?,
        agreement_terms_status = ?, security_type = ?, agreement_signed = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      agreementSignedAt,
      input.agreementDocumentId,
      agreementRateText,
      input.agreementTermsStatus,
      input.securityType,
      Number(Boolean(agreementSignedAt && input.agreementTermsStatus === "compliant")),
      input.loanId,
    );
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, reason, metadata_json)
      VALUES (?, ?, ?, ?)
    `).run(
      "div7a_loan_agreement",
      String(input.loanId),
      "更新 Div 7A 书面协议资料",
      JSON.stringify({ agreementSignedAt, agreementDocumentId: input.agreementDocumentId, agreementRateText, agreementTermsStatus: input.agreementTermsStatus, securityType: input.securityType }),
    );
  });
  transaction();
}
