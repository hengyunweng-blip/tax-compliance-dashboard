import { addYears } from "date-fns";
import { getRawDb } from "@/lib/db/client";
import type { ObligationInput } from "@/lib/domain/obligations/rules";
import { RULE_LABELS } from "@/lib/domain/obligations/rules";
import { getBenchmarkRateForIncomeYear } from "@/lib/domain/div7a/rates";
import { parseBenchmarkRateText } from "@/lib/domain/div7a/rates";
import type { DateOnly } from "@/lib/time/melbourne";
import { parseMelbourneDate } from "@/lib/time/melbourne";
import type { AgreementTermsStatus, SecurityType } from "@/lib/domain/div7a/opening-balances";

export type LodgmentDayInput = {
  companyTaxDue: DateOnly;
  companyTaxLodgedAt: DateOnly | null;
};

export type AgreementInput = {
  agreementSignedAt: DateOnly | null;
  agreementDocumentId: number | null;
  agreementTermsStatus: AgreementTermsStatus;
  securityType: SecurityType;
  agreementRateText: string | null;
  loanDate: DateOnly;
  loanIncomeYear: string;
  loanTermYears: number;
  benchmarkRate: string | null;
  lodgmentDay: DateOnly | null;
};

export type AgreementAssessment = {
  status: "compliant" | "not_compliant" | "blocked";
  missingInputs: string[];
  reasons: string[];
};

export function companyLodgmentDay(input: LodgmentDayInput): DateOnly {
  if (!input.companyTaxLodgedAt) return input.companyTaxDue;
  return input.companyTaxLodgedAt < input.companyTaxDue ? input.companyTaxLodgedAt : input.companyTaxDue;
}

function normalizeIncomeYear(value: string) {
  const normalized = value.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid income year: ${value}`);
  return `FY${normalized}`;
}

function incomeYearStart(value: string) {
  return Number(normalizeIncomeYear(value).slice(2, 6));
}

function financialYearForDate(date: DateOnly) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = month >= 7 ? year : year - 1;
  return `FY${start}-${String(start + 1).slice(-2)}`;
}

export function assessAgreementCompliance(input: AgreementInput): AgreementAssessment {
  const missingInputs: string[] = [];
  const reasons: string[] = [];
  if (!input.lodgmentDay) missingInputs.push("company tax lodgment day");
  if (!input.agreementSignedAt) missingInputs.push("agreement signed date");
  if (!input.agreementDocumentId) missingInputs.push("agreement document");
  if (input.agreementTermsStatus === "unknown" || input.agreementTermsStatus === "needs_review") missingInputs.push("agreement terms status");
  if (!input.benchmarkRate) missingInputs.push(`${normalizeIncomeYear(input.loanIncomeYear)} benchmark rate`);
  if (!input.agreementRateText) missingInputs.push("agreement interest rate");
  if (input.securityType === "unknown") missingInputs.push("security type");

  if (input.agreementTermsStatus === "not_compliant") {
    reasons.push("协议条款已标记为不合规");
  }
  if (input.lodgmentDay && input.agreementSignedAt && input.agreementSignedAt > input.lodgmentDay) {
    reasons.push("协议签署日晚于公司税表 lodgment day");
  }
  if (input.securityType !== "unknown") {
    const maximumTerm = input.securityType === "registered_mortgage" ? 25 : 7;
    if (input.loanTermYears > maximumTerm) reasons.push(`期限超过 ${input.securityType === "registered_mortgage" ? "注册不动产抵押贷款 25 年" : "其他贷款 7 年"}上限`);
  }
  if (input.benchmarkRate && input.agreementRateText) {
    try {
      if (parseBenchmarkRateText(input.agreementRateText).lessThan(parseBenchmarkRateText(input.benchmarkRate))) {
        reasons.push("协议利率低于适用年度基准利率");
      }
    } catch {
      missingInputs.push("valid agreement or benchmark rate");
    }
  }

  if (reasons.length > 0) return { status: "not_compliant", missingInputs, reasons };
  if (missingInputs.length > 0) return { status: "blocked", missingInputs, reasons };
  return { status: "compliant", missingInputs: [], reasons: [] };
}

function defaultCompanyTaxDue(incomeYear: string): DateOnly {
  const startYear = incomeYearStart(incomeYear);
  const endOfFollowingYear = addYears(parseMelbourneDate(`${startYear + 1}-06-30` as DateOnly), 1);
  const calendarYear = endOfFollowingYear.getUTCFullYear();
  // The application only creates regular 30 June company returns. This
  // fallback supplies the same ordinary 28 February effective date when a
  // matching return row has not yet been expanded; it is never used to alter
  // the exact agreement deadline after a company-return row exists.
  return `${calendarYear}-02-28` as DateOnly;
}

function readDate(value: string | null): DateOnly | null {
  if (!value) return null;
  const candidate = value.slice(0, 10) as DateOnly;
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

export type Div7aAgreementDatabaseInput = {
  loanId: number;
  lenderEntityId: string;
  lenderEntityName: string;
  borrower: string;
  loanDate: DateOnly;
  loanIncomeYear: string;
  loanTermYears: number;
  securityType: SecurityType;
  agreementSignedAt: DateOnly | null;
  agreementDocumentId: number | null;
  agreementRateText: string | null;
  agreementTermsStatus: AgreementTermsStatus;
};

export function expandDiv7aAgreementObligation(input: Div7aAgreementDatabaseInput, lodgment: LodgmentDayInput): ObligationInput {
  const loanIncomeYear = normalizeIncomeYear(input.loanIncomeYear);
  const lodgmentDay = companyLodgmentDay(lodgment);
  const benchmarkRate = getBenchmarkRateForIncomeYear(loanIncomeYear, false);
  const assessment = assessAgreementCompliance({
    agreementSignedAt: input.agreementSignedAt,
    agreementDocumentId: input.agreementDocumentId,
    agreementTermsStatus: input.agreementTermsStatus,
    securityType: input.securityType,
    agreementRateText: input.agreementRateText,
    loanDate: input.loanDate,
    loanIncomeYear,
    loanTermYears: input.loanTermYears,
    benchmarkRate: benchmarkRate?.rateText ?? null,
    lodgmentDay,
  });

  return {
    ruleId: "div7a_loan_agreement",
    ruleLabel: RULE_LABELS.div7a_loan_agreement,
    entityId: input.lenderEntityId,
    scopeKey: `loan:${input.loanId}`,
    periodLabel: `${loanIncomeYear} · 贷款 ${input.loanId}`,
    periodStart: null,
    periodEnd: null,
    incomeYear: loanIncomeYear,
    deadlineFy: financialYearForDate(lodgmentDay),
    statutoryDue: lodgmentDay,
    effectiveDue: lodgmentDay,
    status: assessment.status === "compliant" ? "todo" : "blocked",
    portalUrl: "https://www.ato.gov.au/law/view/document?LocID=%22PAC%2F19360027%2F109N%281%29%28b%29%22",
    checklist: ["确认书面协议已在 lodgment day 前成立", "核对协议利率不低于适用年度基准利率", "核对担保类型与最高期限", "确认协议日期和文件均可追溯"],
    notes: JSON.stringify({ loanId: input.loanId, assessment, lodgmentDay, benchmarkRate: benchmarkRate?.rateText ?? null }),
  };
}

export function expandDiv7aAgreementObligations(): ObligationInput[] {
  const db = getRawDb();
  const rows = db.prepare(`
    SELECT l.id AS loan_id, l.lender_entity_id, e.name AS lender_entity_name, l.borrower,
      l.loan_date, COALESCE(l.original_income_year, 'FY' || substr(l.loan_date, 1, 4) || '-' || substr(CAST(CAST(substr(l.loan_date, 1, 4) AS INTEGER) + 1 AS TEXT), 3, 2)) AS loan_income_year,
      l.term_years, l.security_type, l.agreement_signed_at, l.agreement_document_id,
      l.agreement_rate_text, l.agreement_terms_status
    FROM div7a_loans l
    INNER JOIN entities e ON e.id = l.lender_entity_id
    ORDER BY l.id
  `).all() as Array<{
    loan_id: number;
    lender_entity_id: string;
    lender_entity_name: string;
    borrower: string;
    loan_date: DateOnly;
    loan_income_year: string;
    term_years: number;
    security_type: SecurityType;
    agreement_signed_at: DateOnly | null;
    agreement_document_id: number | null;
    agreement_rate_text: string | null;
    agreement_terms_status: AgreementTermsStatus;
  }>;

  return rows.map((row) => {
    const companyTax = db.prepare(`
      SELECT effective_due, lodged_at
      FROM obligations
      WHERE rule_id = 'company_tax_return' AND entity_id = ? AND income_year = ?
      ORDER BY id DESC LIMIT 1
    `).get(row.lender_entity_id, normalizeIncomeYear(row.loan_income_year)) as { effective_due: DateOnly | null; lodged_at: string | null } | undefined;
    const companyTaxDue = companyTax?.effective_due ?? defaultCompanyTaxDue(row.loan_income_year);
    return expandDiv7aAgreementObligation({
      loanId: row.loan_id,
      lenderEntityId: row.lender_entity_id,
      lenderEntityName: row.lender_entity_name,
      borrower: row.borrower,
      loanDate: row.loan_date,
      loanIncomeYear: row.loan_income_year,
      loanTermYears: row.term_years,
      securityType: row.security_type,
      agreementSignedAt: readDate(row.agreement_signed_at),
      agreementDocumentId: row.agreement_document_id,
      agreementRateText: row.agreement_rate_text,
      agreementTermsStatus: row.agreement_terms_status,
    }, {
      companyTaxDue,
      companyTaxLodgedAt: readDate(companyTax?.lodged_at ?? null),
    });
  });
}
