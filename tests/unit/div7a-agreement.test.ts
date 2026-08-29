import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { assessAgreementCompliance, companyLodgmentDay, expandDiv7aAgreementObligation } from "@/lib/domain/div7a/agreement";
import { saveBenchmarkRate } from "@/lib/domain/div7a/rates";
import { createDiv7aLoan } from "@/lib/domain/div7a/service";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import { transitionObligation } from "@/lib/domain/obligations/state-machine";
import { listInboxItems } from "@/lib/ingest/inbox";
import { serializeObligationsToIcs } from "@/lib/domain/obligations/ics";

const ATO_RATE_URL = "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM reminders; DELETE FROM obligations; DELETE FROM div7a_loans; DELETE FROM div7a_benchmark_rates; DELETE FROM opening_balances; DELETE FROM audit_log;");
  saveBenchmarkRate({ incomeYear: "FY2026-27", rateText: "8.77%", sourceUrl: ATO_RATE_URL, retrievedAt: "2026-08-29" });
});

test("uses the earlier actual lodgment date and never defaults to today", () => {
  expect(companyLodgmentDay({ companyTaxDue: "2028-02-28", companyTaxLodgedAt: null })).toBe("2028-02-28");
  expect(companyLodgmentDay({ companyTaxDue: "2028-02-28", companyTaxLodgedAt: "2028-01-15" })).toBe("2028-01-15");
  expect(companyLodgmentDay({ companyTaxDue: "2028-02-28", companyTaxLodgedAt: "2028-03-01" })).toBe("2028-02-28");
});

test("blocks an unclear agreement and rejects a signed date after lodgment day", () => {
  expect(assessAgreementCompliance({
    agreementSignedAt: null,
    agreementDocumentId: null,
    agreementTermsStatus: "unknown",
    securityType: "unknown",
    agreementRateText: null,
    loanDate: "2026-07-01",
    loanIncomeYear: "FY2026-27",
    loanTermYears: 7,
    benchmarkRate: "8.77%",
    lodgmentDay: "2028-02-28",
  })).toMatchObject({ status: "blocked" });

  expect(assessAgreementCompliance({
    agreementSignedAt: "2028-03-01",
    agreementDocumentId: 1,
    agreementTermsStatus: "compliant",
    securityType: "unsecured",
    agreementRateText: "8.77%",
    loanDate: "2026-07-01",
    loanIncomeYear: "FY2026-27",
    loanTermYears: 7,
    benchmarkRate: "8.77%",
    lodgmentDay: "2028-02-28",
  })).toMatchObject({ status: "not_compliant", reasons: ["协议签署日晚于公司税表 lodgment day"] });
});

test("creates one scoped agreement obligation for each loan", () => {
  const document = getRawDb().prepare(`
    INSERT INTO documents (entity_id, file_path, mime, sha256, source, status)
    VALUES ('boyun_co', 'agreement-1.pdf', 'application/pdf', 'agreement-1', 'test', 'confirmed')
  `).run();
  const documentId = Number(document.lastInsertRowid);
  const loanOne = createDiv7aLoan({
    lenderEntityId: "boyun_co", borrower: "Borrower one", loanDate: "2026-07-01", principalCents: 1_000_000,
    termYears: 7, originalIncomeYear: "FY2026-27", securityType: "unsecured", agreementSignedAt: "2026-08-01",
    agreementDocumentId: documentId, agreementRateText: "8.77%", agreementTermsStatus: "compliant",
  });
  const loanTwo = createDiv7aLoan({
    lenderEntityId: "boyun_co", borrower: "Borrower two", loanDate: "2026-07-02", principalCents: 2_000_000,
    termYears: 7, originalIncomeYear: "FY2026-27", securityType: "unsecured", agreementSignedAt: "2026-08-01",
    agreementDocumentId: documentId, agreementRateText: "8.77%", agreementTermsStatus: "compliant",
  });
  getRawDb().prepare(`
    INSERT INTO obligations (rule_id, entity_id, period_label, scope_key, income_year, deadline_fy, statutory_due, effective_due, status)
    VALUES ('company_tax_return', 'boyun_co', 'FY2026-27', 'entity', 'FY2026-27', 'FY2027-28', '2028-02-28', '2028-02-28', 'todo')
  `).run();

  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });

  const rows = getRawDb().prepare(`
    SELECT scope_key, effective_due, status
    FROM obligations
    WHERE rule_id = 'div7a_loan_agreement'
    ORDER BY scope_key
  `).all();
  expect(rows).toEqual([
    { scope_key: `loan:${loanOne}`, effective_due: "2028-02-28", status: "todo" },
    { scope_key: `loan:${loanTwo}`, effective_due: "2028-02-28", status: "todo" },
  ]);

  getRawDb().prepare("UPDATE obligations SET lodged_at = '2028-01-15' WHERE rule_id = 'company_tax_return' AND entity_id = 'boyun_co' AND income_year = 'FY2026-27'").run();
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
  expect(getRawDb().prepare("SELECT DISTINCT effective_due FROM obligations WHERE rule_id = 'div7a_loan_agreement'").all()).toEqual([{ effective_due: "2028-01-15" }]);
});

test("agreement input produces an exact unshifted lodgment-day obligation", () => {
  const result = expandDiv7aAgreementObligation({
    loanId: 9,
    lenderEntityId: "boyun_co",
    lenderEntityName: "Boyun Pty Ltd",
    borrower: "Borrower",
    loanDate: "2026-07-01",
    loanIncomeYear: "FY2026-27",
    loanTermYears: 7,
    securityType: "unsecured",
    agreementSignedAt: "2026-08-01",
    agreementDocumentId: 1,
    agreementRateText: "8.77%",
    agreementTermsStatus: "compliant",
  }, { companyTaxDue: "2028-02-28", companyTaxLodgedAt: "2028-01-15" });
  expect(result).toMatchObject({
    scopeKey: "loan:9",
    statutoryDue: "2028-01-15",
    effectiveDue: "2028-01-15",
    status: "todo",
  });
});

test("refreshes the loan agreement deadline after a user-entered company tax lodgment date", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co", borrower: "Lodgment refresh borrower", loanDate: "2026-07-01", principalCents: 1_000_000,
    termYears: 7, originalIncomeYear: "FY2026-27", securityType: "unsecured",
  });
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
  const db = getRawDb();
  db.prepare(`
    INSERT INTO obligations (rule_id, entity_id, period_label, scope_key, income_year, deadline_fy, statutory_due, effective_due, status)
    VALUES ('company_tax_return', 'boyun_co', 'FY2026-27', 'entity', 'FY2026-27', 'FY2027-28', '2028-02-28', '2028-02-28', 'draft_ready')
  `).run();
  const companyTax = db.prepare("SELECT id FROM obligations WHERE rule_id = 'company_tax_return' AND entity_id = 'boyun_co' AND income_year = 'FY2026-27'").get() as { id: number };
  db.prepare("UPDATE obligations SET status = 'draft_ready' WHERE id = ?").run(companyTax.id);

  transitionObligation({ obligationId: companyTax.id, to: "lodged", reason: "User entered actual lodgment date", lodgedAt: "2027-12-01" });

  expect(db.prepare("SELECT effective_due FROM obligations WHERE rule_id = 'div7a_loan_agreement' AND scope_key = ?").get(`loan:${loanId}`)).toEqual({ effective_due: "2027-12-01" });
  expect(db.prepare("SELECT lodged_at FROM obligations WHERE id = ?").get(companyTax.id)).toEqual({ lodged_at: "2027-12-01" });
});

test("keeps an unknown security type blocked instead of assuming a seven-year agreement", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co", borrower: "Unknown security borrower", loanDate: "2026-07-01", principalCents: 1_000_000,
    termYears: 7, originalIncomeYear: "FY2026-27", securityType: "unknown", agreementRateText: "8.77%",
    agreementTermsStatus: "compliant", agreementSignedAt: "2026-08-01", agreementDocumentId: 1,
  });
  const result = expandDiv7aAgreementObligation({
    loanId, lenderEntityId: "boyun_co", lenderEntityName: "Boyun Pty Ltd", borrower: "Unknown security borrower",
    loanDate: "2026-07-01", loanIncomeYear: "FY2026-27", loanTermYears: 7, securityType: "unknown",
    agreementSignedAt: "2026-08-01", agreementDocumentId: 1, agreementRateText: "8.77%", agreementTermsStatus: "compliant",
  }, { companyTaxDue: "2028-02-28", companyTaxLodgedAt: null });
  expect(result.status).toBe("blocked");
  expect(result.notes).toContain("security type");
});

test("creates reminder coverage and exposes the agreement separately in Inbox", async () => {
  createDiv7aLoan({ lenderEntityId: "boyun_co", borrower: "Reminder borrower", loanDate: "2026-07-01", principalCents: 1_000_000, termYears: 7, originalIncomeYear: "FY2026-27" });
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
  const db = getRawDb();
  const agreement = db.prepare("SELECT id, effective_due FROM obligations WHERE rule_id = 'div7a_loan_agreement' LIMIT 1").get() as { id: number; effective_due: string };
  expect(db.prepare("SELECT fire_at FROM reminders WHERE obligation_id = ? AND fire_at IN ('2028-01-29', '2028-02-18', '2028-02-25', '2028-02-28') ORDER BY fire_at").all(agreement.id)).toEqual([
    { fire_at: "2028-01-29" },
    { fire_at: "2028-02-18" },
    { fire_at: "2028-02-25" },
    { fire_at: "2028-02-28" },
  ]);
  const items = await listInboxItems();
  expect(items.some((item) => item.kind === "div7a_agreement")).toBe(true);
});

test("exports each loan agreement obligation to the calendar independently", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Calendar borrower",
    loanDate: "2026-07-01",
    principalCents: 1_000_000,
    termYears: 7,
    originalIncomeYear: "FY2026-27",
  });
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
  const row = getRawDb().prepare(`
    SELECT o.id, e.name AS entity_name, o.period_label, o.effective_due, o.statutory_due, o.status, r.portal_url
    FROM obligations o
    INNER JOIN entities e ON e.id = o.entity_id
    INNER JOIN obligation_rules r ON r.id = o.rule_id
    WHERE o.rule_id = 'div7a_loan_agreement' AND o.scope_key = ?
  `).get(`loan:${loanId}`) as {
    id: number;
    entity_name: string;
    period_label: string;
    effective_due: string;
    statutory_due: string;
    status: string;
    portal_url: string;
  };

  const ics = serializeObligationsToIcs([{
    id: row.id,
    entityName: row.entity_name,
    periodLabel: row.period_label,
    ruleLabel: "Div 7A 协议截止义务",
    effectiveDue: row.effective_due as `${number}-${number}-${number}`,
    statutoryDue: row.statutory_due as `${number}-${number}-${number}`,
    status: row.status,
    portalUrl: row.portal_url,
  }]);

  expect(ics).toContain("Div 7A 协议截止义务");
  expect(ics).toContain("DTSTART;VALUE=DATE:20280228");
  expect(ics).toContain("实际日: 28 Feb 2028");
});
