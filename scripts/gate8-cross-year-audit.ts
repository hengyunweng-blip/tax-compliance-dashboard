import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { getRawDb, getDatabaseFilePath } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createBackupArchive, restoreBackupArchive } from "@/lib/backup";
import { createTransaction } from "@/lib/ingest/transactions";
import { generateBasWorksheet, markBasLodged, updateBasPaygInstalments } from "@/lib/domain/bas/generator";
import { buildCompanyTaxWorksheet, buildPersonalTaxSummary, buildTrustDistributionDraft } from "@/lib/domain/annual";
import { saveTrustDistribution } from "@/lib/domain/annual/trust-distributions";
import { createAsset, getAssetDepreciationForEntity } from "@/lib/domain/assets/service";
import { createDiv7aLoan, getDiv7aLoanSummary, getDiv7aLoanSchedule, recordDiv7aRepayment } from "@/lib/domain/div7a/service";
import { saveDiv7aOpeningBalance } from "@/lib/domain/div7a/opening-balances";
import { getSuperProgress, markSuperNoticeSubmitted, recordSuperContribution } from "@/lib/domain/super/service";
import { ensureObligationsForFy, getObligationsForFy } from "@/lib/domain/obligations/repository";
import { transitionObligation } from "@/lib/domain/obligations/state-machine";
import { calculateBasDueDates } from "@/lib/domain/obligations/calculator";
import { listTrustDistributions } from "@/lib/domain/annual/trust-distributions";
import { getRawDb as getEvidenceDb } from "@/lib/db/client";
import { GET as annualGet } from "@/app/api/annual/route";
import { GET as obligationsGet } from "@/app/api/obligations/route";
import { groupDiv7aLoans } from "@/lib/domain/div7a/amalgamated";

const EVIDENCE_DIR = path.resolve(process.cwd(), process.env.EVIDENCE_DIR ?? "docs/evidence/gate8");
const FY = "FY2026-27";
const NEXT_FY = "FY2027-28";
const COMPANY_IDS = ["boyun_co", "yeeliving_co", "neighbourhood_co"] as const;
const ENTITY_IDS = ["self", "spouse", "boyun_trust", ...COMPANY_IDS] as const;
const REQUIRED_BACKUP_TABLES = [
  "entities",
  "transactions",
  "obligations",
  "bas_worksheets",
  "div7a_loans",
  "assets",
  "opening_balances",
] as const;

type AnyRow = Record<string, unknown>;

function accountId(entityId: string, code: string) {
  const row = getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = ? AND code = ?").get(entityId, code) as { id: number } | undefined;
  if (!row) throw new Error(`Missing account ${entityId}/${code}`);
  return row.id;
}

function writeJson(fileName: string, value: unknown) {
  fs.writeFileSync(path.join(EVIDENCE_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(fileName: string, value: string) {
  fs.writeFileSync(path.join(EVIDENCE_DIR, fileName), value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function addCompanyQuarterTransactions(entityId: string, multiplier: number) {
  const quarters = [
    ["2026-07-15", "2026-08-15", "2026-09-15"],
    ["2026-10-15", "2026-11-15", "2026-12-15"],
    ["2027-01-15", "2027-02-15", "2027-03-15"],
    ["2027-04-15", "2027-05-15", "2027-06-15"],
  ] as const;

  quarters.forEach((dates, quarterIndex) => {
    const scale = multiplier * (quarterIndex + 1);
    const incomeRows = [
      { date: dates[0], description: `Q${quarterIndex + 1} taxable commission`, amountCents: 110_000 * scale, gstCents: 10_000 * scale, gstCode: "GST_INCOME" as const },
      { date: dates[1], description: `Q${quarterIndex + 1} GST-free sale`, amountCents: 50_000 * scale, gstCents: 0, gstCode: "GST_FREE_INCOME" as const },
      { date: dates[2], description: `Q${quarterIndex + 1} input-taxed sale`, amountCents: 25_000 * scale, gstCents: 0, gstCode: "INPUT_TAXED" as const },
      { date: dates[2], description: `Q${quarterIndex + 1} loan receipt excluded from supply`, amountCents: 7_500 * scale, gstCents: 0, gstCode: "NOT_A_SUPPLY" as const },
    ];
    for (const row of incomeRows) {
      createTransaction({
        entityId,
        ...row,
        accountId: accountId(entityId, "400"),
        source: "gate8-cross-year",
      });
    }
    createTransaction({
      entityId,
      date: dates[0],
      description: `Q${quarterIndex + 1} GST operating expense`,
      accountId: accountId(entityId, "500"),
      gstCode: "GST_EXPENSE",
      amountCents: -22_000 * scale,
      gstCents: -2_000 * scale,
      source: "gate8-cross-year",
    });
    createTransaction({
      entityId,
      date: dates[1],
      description: `Q${quarterIndex + 1} capital purchase`,
      accountId: accountId(entityId, "510"),
      gstCode: "GST_CAPITAL",
      amountCents: -110_000 * scale,
      gstCents: -10_000 * scale,
      source: "gate8-cross-year",
    });
    createTransaction({
      entityId,
      date: dates[2],
      description: `Q${quarterIndex + 1} bank fee`,
      accountId: accountId(entityId, "500"),
      gstCode: "NO_GST",
      amountCents: -5_000 * scale,
      gstCents: 0,
      source: "gate8-cross-year",
    });
  });
}

function addTrustTransactions() {
  createTransaction({
    entityId: "boyun_trust",
    date: "2026-08-01",
    description: "Trust distributable income",
    accountId: accountId("boyun_trust", "400"),
    gstCode: "GST_FREE_INCOME",
    amountCents: 300_000,
    gstCents: 0,
    source: "gate8-cross-year",
  });
  createTransaction({
    entityId: "boyun_trust",
    date: "2026-09-01",
    description: "Trust operating expense",
    accountId: accountId("boyun_trust", "500"),
    gstCode: "NO_GST",
    amountCents: -50_000,
    gstCents: 0,
    source: "gate8-cross-year",
  });
}

function transitionThroughPaid(obligationId: number, label: string, lodgedAt: string, paidAt: string) {
  transitionObligation({ obligationId, to: "collecting", reason: `${label}：开始收集` });
  transitionObligation({ obligationId, to: "draft_ready", reason: `${label}：底稿就绪` });
  transitionObligation({ obligationId, to: "lodged", reason: `${label}：记录实际提交`, lodgedAt });
  transitionObligation({ obligationId, to: "paid", reason: `${label}：记录实际缴款`, paidAt });
}

function prepareData() {
  seedDatabase();
  const db = getRawDb();
  db.exec(`
    DELETE FROM reminders;
    DELETE FROM bas_worksheets;
    DELETE FROM trust_distributions;
    DELETE FROM super_contributions;
    DELETE FROM transactions;
    DELETE FROM obligations;
    DELETE FROM div7a_loans;
    DELETE FROM assets;
    DELETE FROM opening_balances;
    DELETE FROM audit_log;
  `);
  db.prepare("UPDATE entities SET acn = NULL, asic_review_date = NULL").run();
  for (const entityId of COMPANY_IDS) {
    db.prepare("UPDATE entities SET acn = ?, asic_review_date = ? WHERE id = ?").run(`ACN-G8-${entityId}`, "2026-07-15", entityId);
  }
  db.prepare("UPDATE licences SET anniversary_date = ? WHERE holder = 'self' AND type = 'estate_agent'").run("2026-08-15");

  addCompanyQuarterTransactions("boyun_co", 1);
  addCompanyQuarterTransactions("yeeliving_co", 2);
  addTrustTransactions();

  for (const [entityId, name, assetType, costExGstCents, privateUsePercent] of [
    ["boyun_co", "Boyun company vehicle", "vehicle", 1_000_000, 20],
    ["yeeliving_co", "Yeeliving equipment", "equipment", 2_000_000, 0],
    ["neighbourhood_co", "Neighbourhood equipment", "equipment", 500_000, 0],
  ] as const) {
    createAsset({
      entityId,
      name,
      assetType,
      purchaseDate: "2026-07-01",
      availableForUseDate: "2026-07-01",
      costExGstCents,
      usefulLifeYears: 5,
      method: entityId === "yeeliving_co" ? "diminishing_value" : "prime_cost",
      privateUsePercent,
    });
  }

  const boyunLoanOne = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "self",
    loanDate: "2026-06-30",
    originalIncomeYear: "FY2025-26",
    principalCents: 1_000_000,
    termYears: 7,
    benchmarkRate: "8.77%",
    securityType: "unsecured",
  });
  saveDiv7aOpeningBalance({
    loanId: boyunLoanOne,
    balanceCents: 900_000,
    asOfDate: "2026-06-30",
    originalIncomeYear: "FY2025-26",
    originalTermYears: 7,
    securityType: "unsecured",
    agreementTermsStatus: "unknown",
    sourceDescription: "会计 FY2025–26 底稿",
    enteredBy: "self",
    enteredAt: "2026-08-30",
  });
  const boyunLoanTwo = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "self",
    loanDate: "2026-06-30",
    originalIncomeYear: "FY2025-26",
    principalCents: 500_000,
    termYears: 7,
    benchmarkRate: "8.77%",
    securityType: "unsecured",
  });
  saveDiv7aOpeningBalance({
    loanId: boyunLoanTwo,
    balanceCents: 450_000,
    asOfDate: "2026-06-30",
    originalIncomeYear: "FY2025-26",
    originalTermYears: 7,
    securityType: "unsecured",
    agreementTermsStatus: "unknown",
    sourceDescription: "会计 FY2025–26 底稿",
    enteredBy: "self",
    enteredAt: "2026-08-30",
  });
  const otherLoanIds = COMPANY_IDS.slice(1).map((entityId) => createDiv7aLoan({
    lenderEntityId: entityId,
    borrower: "self",
    loanDate: "2026-07-01",
    originalIncomeYear: "FY2026-27",
    principalCents: entityId === "yeeliving_co" ? 2_000_000 : 500_000,
    termYears: 7,
    benchmarkRate: "8.77%",
    securityType: "unsecured",
  }));

  recordDiv7aRepayment({ loanId: boyunLoanOne, date: "2027-06-30", amountCents: 100_000 });
  createTransaction({
    entityId: "boyun_co",
    date: "2027-07-01",
    description: "New director draw after repayment for s109R screening",
    counterparty: "self",
    accountId: accountId("boyun_co", "500"),
    gstCode: "NO_GST",
    amountCents: -100_000,
    gstCents: 0,
    source: "gate8-cross-year",
  });

  recordSuperContribution({ person: "self", fy: FY, amountCents: 1_000_000, paidAt: "2027-06-29" });
  markSuperNoticeSubmitted({ person: "spouse", fy: FY, submittedAt: "2027-06-20" });
  ensureObligationsForFy(FY);
  return { db, boyunLoanOne, boyunLoanTwo, otherLoanIds };
}

function runBasWorkflow() {
  const db = getRawDb();
  const obligations = db.prepare(`
    SELECT id, entity_id, period_label, effective_due
    FROM obligations
    WHERE rule_id = 'bas_quarterly' AND income_year = ?
    ORDER BY entity_id, period_label
  `).all(FY) as Array<{ id: number; entity_id: string; period_label: string; effective_due: string | null }>;
  const basRows: AnyRow[] = [];
  for (const obligation of obligations) {
    const generated = generateBasWorksheet(obligation.id);
    const payg = obligation.entity_id === "neighbourhood_co" ? { payg5aCents: 0, payg5bCents: 0 } : { payg5aCents: 2_500, payg5bCents: 0 };
    const worksheet = updateBasPaygInstalments(obligation.id, payg);
    const quarter = obligation.period_label.slice(-2);
    const lodgedAt = quarter === "Q1" ? "2026-10-20" : quarter === "Q2" ? "2027-02-20" : quarter === "Q3" ? "2027-04-20" : "2027-07-20";
    const paidAt = quarter === "Q1" ? "2026-10-21" : quarter === "Q2" ? "2027-02-21" : quarter === "Q3" ? "2027-04-21" : "2027-07-21";
    markBasLodged(obligation.id, `G8-${obligation.id}`, worksheet.statementTotalCents ?? 0, lodgedAt);
    transitionObligation({ obligationId: obligation.id, to: "paid", reason: `Gate 8 ${obligation.period_label}：记录实际缴款`, paidAt });
    const final = db.prepare(`
      SELECT id, g1_cents, a1_cents, b1_cents, g10_cents, g11_cents,
        payg_5a_cents, payg_5b_cents, statement_total_cents
      FROM bas_worksheets WHERE id = ?
    `).get(generated.worksheet.id) as AnyRow;
    basRows.push({ entityId: obligation.entity_id, periodLabel: obligation.period_label, ...final });
  }
  return basRows;
}

function runAnnualWorkflow() {
  const db = getRawDb();
  const companyAnnualRows: AnyRow[] = [];
  const annualByEntity: Record<string, ReturnType<typeof buildCompanyTaxWorksheet>> = {};
  for (const entityId of COMPANY_IDS) {
    const worksheet = buildCompanyTaxWorksheet(entityId, FY);
    annualByEntity[entityId] = worksheet;
    const companyTax = db.prepare(`
      SELECT id FROM obligations
      WHERE entity_id = ? AND rule_id = 'company_tax_return' AND income_year = ? AND deadline_fy = ?
    `).get(entityId, FY, NEXT_FY) as { id: number } | undefined;
    if (!companyTax) throw new Error(`Missing company tax obligation for ${entityId}`);
    transitionThroughPaid(companyTax.id, `${entityId} 公司税表`, "2028-01-15", "2028-02-20");
    const state = db.prepare("SELECT id, status, lodged_at, paid_at FROM obligations WHERE id = ?").get(companyTax.id) as AnyRow;
    companyAnnualRows.push({ entityId, ...state, incomeCents: worksheet.incomeCents, operatingExpenseCents: worksheet.operatingExpenseCents, capitalPurchaseCents: worksheet.capitalPurchaseCents });
  }

  const trust = buildTrustDistributionDraft("boyun_trust", FY);
  saveTrustDistribution({ trustEntityId: "boyun_trust", incomeYear: FY, beneficiaryEntityId: "self", amountCents: 125_000, resolutionDate: "2027-06-29", status: "signed", sourceDescription: "Gate 8 signed resolution evidence", enteredBy: "self" });
  saveTrustDistribution({ trustEntityId: "boyun_trust", incomeYear: FY, beneficiaryEntityId: "spouse", amountCents: 125_000, resolutionDate: "2027-06-29", status: "signed", sourceDescription: "Gate 8 signed resolution evidence", enteredBy: "self" });
  const trustAfter = buildTrustDistributionDraft("boyun_trust", FY);
  const personal = {
    self: buildPersonalTaxSummary("self", FY),
    spouse: buildPersonalTaxSummary("spouse", FY),
  };
  const apiResponse = annualGet(new Request("http://localhost/api/annual?fy=FY2026-27"));

  return { annualByEntity, companyAnnualRows, trustBeforeDistribution: trust, trustAfterDistribution: trustAfter, personal, apiResponse };
}

function runObligationWorkflow() {
  const first = ensureObligationsForFy(FY);
  const second = ensureObligationsForFy(FY);
  const beforeNext = ensureObligationsForFy(NEXT_FY);
  const q2BeforeHolidayConfig = calculateBasDueDates(NEXT_FY, "Q2");
  const afterNext = ensureObligationsForFy(NEXT_FY);
  const apiResponse = obligationsGet(new Request("http://localhost/api/obligations?fy=FY2027-28"));
  return {
    firstCount: first.length,
    secondCount: second.length,
    nextCountBeforeReensure: beforeNext.length,
    nextCountAfterReensure: afterNext.length,
    nextBas: afterNext.filter((row) => row.ruleId === "bas_quarterly").map((row) => ({ entityId: row.entityId, periodLabel: row.periodLabel, statutoryDue: row.statutoryDue, effectiveDue: row.effectiveDue, status: row.status })),
    q2BeforeHolidayConfig,
    apiResponse,
  };
}

function tableRows(dbPath: string, table: string): AnyRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(`SELECT * FROM ${table}`).all() as AnyRow[];
  } finally {
    db.close();
  }
}

function sqlText(table: string, rows: AnyRow[]) {
  return [
    `-- SELECT * FROM ${table};`,
    ...rows.map((row) => JSON.stringify(row)),
  ].join("\n");
}

async function runBackupRoundTrip(databaseFilePath: string) {
  const sourceFilesPath = path.join(path.dirname(databaseFilePath), "files");
  fs.mkdirSync(sourceFilesPath, { recursive: true });
  fs.writeFileSync(path.join(sourceFilesPath, "gate8-proof.txt"), "Gate 8 backup files payload\n", "utf8");
  const before: Record<string, AnyRow[]> = {};
  for (const table of REQUIRED_BACKUP_TABLES) before[table] = tableRows(databaseFilePath, table);
  writeJson("backup-before.json", before);

  const archive = await createBackupArchive({ databaseFilePath, filesDirectory: sourceFilesPath });
  const archivePath = path.join(EVIDENCE_DIR, "backup-roundtrip.zip");
  await fsp.writeFile(archivePath, archive.buffer);

  const restoreDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "tax-compliance-gate8-restore-"));
  const restoredDatabasePath = path.join(restoreDirectory, "restored.db");
  const restoredFilesPath = path.join(restoreDirectory, "files");
  try {
    await restoreBackupArchive(archive.buffer, { databaseFilePath: restoredDatabasePath, filesDirectory: restoredFilesPath });
    const after: Record<string, AnyRow[]> = {};
    for (const table of REQUIRED_BACKUP_TABLES) after[table] = tableRows(restoredDatabasePath, table);
    writeJson("backup-after.json", after);
    const beforeSql = REQUIRED_BACKUP_TABLES.flatMap((table) => [sqlText(table, before[table]), ""]).join("\n");
    const afterSql = REQUIRED_BACKUP_TABLES.flatMap((table) => [sqlText(table, after[table]), ""]).join("\n");
    writeText("backup-sql-before.txt", beforeSql);
    writeText("backup-sql-after.txt", afterSql);
    const diff = spawnSync("/usr/bin/diff", ["-u", path.join(EVIDENCE_DIR, "backup-sql-before.txt"), path.join(EVIDENCE_DIR, "backup-sql-after.txt")], { encoding: "utf8" });
    writeText("backup-diff.txt", `diff exit code: ${diff.status ?? 2}\n${diff.stdout ?? ""}${diff.stderr ?? ""}`);
    return {
      archiveEntries: archive.entries,
      diffExitCode: diff.status,
      filesEqual: fs.readFileSync(path.join(sourceFilesPath, "gate8-proof.txt"), "utf8") === fs.readFileSync(path.join(restoredFilesPath, "gate8-proof.txt"), "utf8"),
      rowsBefore: Object.fromEntries(REQUIRED_BACKUP_TABLES.map((table) => [table, before[table].length])),
      rowsAfter: Object.fromEntries(REQUIRED_BACKUP_TABLES.map((table) => [table, after[table].length])),
    };
  } finally {
    await fsp.rm(restoreDirectory, { recursive: true, force: true });
  }
}

function writeSqlEvidence() {
  const db = getRawDb();
  const entityRows = db.prepare("SELECT id, name, type, gst_registered FROM entities ORDER BY sort_order").all() as AnyRow[];
  const basRows = db.prepare(`
    SELECT entity_id, period_label, statutory_due, effective_due, status
    FROM obligations WHERE rule_id = 'bas_quarterly' AND income_year = ? ORDER BY entity_id, period_label
  `).all(FY) as AnyRow[];
  const obligationRows = db.prepare(`
    SELECT entity_id, rule_id, period_label, scope_key, income_year, deadline_fy, statutory_due, effective_due, status, lodged_at, paid_at
    FROM obligations WHERE deadline_fy IN (?, ?) ORDER BY deadline_fy, entity_id, rule_id, period_label, scope_key
  `).all(FY, NEXT_FY) as AnyRow[];
  const trustRows = db.prepare(`
    SELECT trust_entity_id, income_year, beneficiary_entity_id, amount_cents, resolution_date, status, source_description
    FROM trust_distributions ORDER BY income_year, beneficiary_entity_id
  `).all() as AnyRow[];
  const superRows = db.prepare("SELECT person, fy, amount_cents, paid_at, notice_submitted_at FROM super_contributions ORDER BY person, fy, id").all() as AnyRow[];
  const loanRows = db.prepare("SELECT id, lender_entity_id, borrower, loan_date, principal_cents, original_income_year, term_years, security_type FROM div7a_loans ORDER BY id").all() as AnyRow[];
  const assetRows = db.prepare("SELECT id, entity_id, name, asset_type, purchase_date, cost_ex_gst_cents, useful_life_years, method, private_use_percent FROM assets ORDER BY id").all() as AnyRow[];
  writeText("sql-entities.txt", sqlText("entities", entityRows));
  writeText("sql-bas-fy2026-27.txt", sqlText("obligations (BAS FY2026-27)", basRows));
  writeText("sql-obligations-two-fy.txt", sqlText("obligations (FY2026-27 and FY2027-28 deadline)", obligationRows));
  writeText("sql-trust-distributions.txt", sqlText("trust_distributions", trustRows));
  writeText("sql-super-tasks.txt", sqlText("super_contributions", superRows));
  writeText("sql-div7a-loans.txt", sqlText("div7a_loans", loanRows));
  writeText("sql-assets.txt", sqlText("assets", assetRows));
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const databaseFilePath = getDatabaseFilePath();
  const { boyunLoanOne, boyunLoanTwo, otherLoanIds } = prepareData();
  const basRows = runBasWorkflow();
  const obligations = runObligationWorkflow();
  const annual = runAnnualWorkflow();

  const annualReconciliation = COMPANY_IDS.map((entityId) => {
    const worksheet = annual.annualByEntity[entityId];
    const bas = basRows.filter((row) => row.entityId === entityId);
    const basG1Cents = bas.reduce((total, row) => total + Number(row.g1_cents), 0);
    const bas1ACents = bas.reduce((total, row) => total + Number(row.a1_cents), 0);
    return {
      entityId,
      basG1Cents,
      bas1ACents,
      basG1Minus1ACents: basG1Cents - bas1ACents,
      annualIncomeCents: worksheet.incomeCents,
      differenceCents: basG1Cents - bas1ACents - worksheet.incomeCents,
      annualReconciliation: worksheet.reconciliation,
    };
  });

  const assets = COMPANY_IDS.map((entityId) => {
    const summary = getAssetDepreciationForEntity(entityId, FY);
    const bookReduction = summary.rows.reduce((total, row) => total + (row.openingBookValueCents === null || row.closingBookValueCents === null ? 0 : row.openingBookValueCents - row.closingBookValueCents), 0);
    return { entityId, totalDepreciationCents: summary.totalDepreciationCents, bookReductionCents: bookReduction, differenceCents: (summary.totalDepreciationCents ?? 0) - bookReduction, rows: summary.rows };
  });

  const div7a = [boyunLoanOne, boyunLoanTwo, ...otherLoanIds].map((loanId) => {
    const row = getDiv7aLoanSummary(loanId, FY);
    return {
      loanId,
      incomeYear: FY,
      openingBalanceCents: row.openingBalanceCents,
      interestCents: row.interestCents,
      actualRepaymentCents: row.actualRepaymentCents,
      closingBalanceCents: row.closingBalanceCents,
      identityDifferenceCents: row.closingBalanceCents === null || row.openingBalanceCents === null || row.interestCents === null || row.actualRepaymentCents === null ? null : row.closingBalanceCents - row.openingBalanceCents - row.interestCents + row.actualRepaymentCents,
      schedule: getDiv7aLoanSchedule(loanId, FY, FY),
      repaymentValidityRisks: row.repaymentValidityRisks,
    };
  });
  const amalgamated = groupDiv7aLoans([boyunLoanOne, boyunLoanTwo, ...otherLoanIds].map((loanId) => {
    const row = getDiv7aLoanSummary(loanId, FY);
    return { id: row.id, lenderEntityId: row.lenderEntityId, borrower: row.borrower, loanIncomeYear: row.loanIncomeYear, securityType: row.securityType, minimumRepaymentCents: row.minimumRepaymentCents };
  }));

  const trustDistributions = listTrustDistributions({ trustEntityId: "boyun_trust", incomeYear: FY });
  const trustTotal = trustDistributions.reduce((total, row) => total + row.amountCents, 0);
  const personalApi = {
    self: buildPersonalTaxSummary("self", FY),
    spouse: buildPersonalTaxSummary("spouse", FY),
  };
  const personalApiResponse = await annualGet(new Request("http://localhost/api/annual?fy=FY2026-27&entityId=self"));
  const obligationsApiResponse = await obligationsGet(new Request("http://localhost/api/obligations?fy=FY2027-28"));
  writeJson("api-annual-all-fy2026-27.json", await annual.apiResponse.json());
  writeJson("api-annual-self-fy2026-27.json", await personalApiResponse.json());
  writeJson("api-obligations-fy2027-28.json", await obligationsApiResponse.json());
  writeJson("bas-four-quarter-table.json", basRows);
  writeJson("annual-reconciliation.json", annualReconciliation);
  writeJson("trust-distribution-cross-check.json", {
    trustDistributableIncomeCents: annual.trustAfterDistribution.distributableIncomeCents,
    trustDistributionTotalCents: trustTotal,
    differenceCents: (annual.trustAfterDistribution.distributableIncomeCents ?? 0) - trustTotal,
    trustRows: trustDistributions,
    selfPersonalDistributionCents: personalApi.self.trustDistributionCents,
    spousePersonalDistributionCents: personalApi.spouse.trustDistributionCents,
  });
  writeJson("super-cross-check.json", [getSuperProgress("self", FY), getSuperProgress("spouse", FY)]);
  writeJson("assets-cross-check.json", assets);
  writeJson("div7a-cross-check.json", div7a);
  writeJson("div7a-amalgamated.json", amalgamated);
  writeJson("rollover-two-fy.json", obligations);
  writeSqlEvidence();

  const backup = await runBackupRoundTrip(databaseFilePath);
  writeJson("backup-roundtrip.json", backup);

  const entityCount = (getRawDb().prepare("SELECT COUNT(*) AS count FROM entities WHERE active = 1").get() as { count: number }).count;
  const obligationCounts = dbCounts();
  writeJson("summary.json", {
    databaseFilePath,
    entityIds: ENTITY_IDS,
    entityCount,
    basRows,
    annualReconciliation,
    trust: {
      distributableIncomeCents: annual.trustAfterDistribution.distributableIncomeCents,
      distributionTotalCents: trustTotal,
      differenceCents: (annual.trustAfterDistribution.distributableIncomeCents ?? 0) - trustTotal,
    },
    personal: { self: personalApi.self.trustDistributionCents, spouse: personalApi.spouse.trustDistributionCents },
    assets,
    div7a,
    obligationCounts,
    backup,
  });
}

function dbCounts() {
  const db = getEvidenceDb();
  return {
    fy2026_27: db.prepare("SELECT COUNT(*) AS count FROM obligations WHERE deadline_fy = ?").get(FY) as { count: number },
    fy2027_28: db.prepare("SELECT COUNT(*) AS count FROM obligations WHERE deadline_fy = ?").get(NEXT_FY) as { count: number },
    bas2026_27: db.prepare("SELECT COUNT(*) AS count FROM obligations WHERE rule_id = 'bas_quarterly' AND income_year = ?").get(FY) as { count: number },
    bas2027_28: db.prepare("SELECT COUNT(*) AS count FROM obligations WHERE rule_id = 'bas_quarterly' AND income_year = ?").get(NEXT_FY) as { count: number },
  };
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
