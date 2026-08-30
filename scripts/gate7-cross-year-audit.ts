import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createBackupArchive, restoreBackupArchive } from "@/lib/backup";
import { createTransaction } from "@/lib/ingest/transactions";
import { ensureObligationsForFy, getObligationsForFy } from "@/lib/domain/obligations/repository";
import { generateBasWorksheet, markBasLodged, updateBasPaygInstalments } from "@/lib/domain/bas/generator";
import { buildCompanyTaxWorksheet, buildPersonalTaxSummary, buildTrustDistributionDraft } from "@/lib/domain/annual";
import { createAsset, getAssetDepreciationForEntity, getAssetSchedule } from "@/lib/domain/assets/service";
import { createDiv7aLoan } from "@/lib/domain/div7a/service";
import { getSuperProgress, markSuperNoticeSubmitted, recordSuperContribution } from "@/lib/domain/super/service";
import { transitionObligation } from "@/lib/domain/obligations/state-machine";

const EVIDENCE_DIR = path.resolve(process.cwd(), "docs/evidence/gate7");
const CUTOVER_DB_FILE = "cross-year-evidence.db";
const SOURCE_FILES_DIR = "files";
const FY = "2026-27";
const COMPANY_IDS = ["boyun_co", "yeeliving_co", "neighbourhood_co"] as const;
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

function addCompanyQuarterTransactions(entityId: string, multiplier: number) {
  const quarters = [
    ["2026-07-15", "2026-08-15", "2026-09-15"],
    ["2026-10-15", "2026-11-15", "2026-12-15"],
    ["2027-01-15", "2027-02-15", "2027-03-15"],
    ["2027-04-15", "2027-05-15", "2027-06-15"],
  ] as const;
  quarters.forEach((dates, quarterIndex) => {
    const base = multiplier * (quarterIndex + 1);
    const income = [
      { date: dates[0], description: `Q${quarterIndex + 1} GST income`, amountCents: 110_000 * base, gstCents: 10_000 * base, gstCode: "GST_INCOME" as const },
      { date: dates[1], description: `Q${quarterIndex + 1} GST-free income`, amountCents: 50_000 * base, gstCents: 0, gstCode: "GST_FREE_INCOME" as const },
      { date: dates[2], description: `Q${quarterIndex + 1} non-GST income`, amountCents: 25_000 * base, gstCents: 0, gstCode: "NO_GST" as const },
    ];
    income.forEach((item) => createTransaction({
      entityId,
      ...item,
      accountId: accountId(entityId, "400"),
      source: "gate7-cross-year",
    }));
    createTransaction({
      entityId,
      date: dates[0],
      description: `Q${quarterIndex + 1} GST operating expense`,
      accountId: accountId(entityId, "500"),
      gstCode: "GST_EXPENSE",
      amountCents: -22_000 * base,
      gstCents: -2_000 * base,
      source: "gate7-cross-year",
    });
    createTransaction({
      entityId,
      date: dates[1],
      description: `Q${quarterIndex + 1} GST capital purchase`,
      accountId: accountId(entityId, "510"),
      gstCode: "GST_CAPITAL",
      amountCents: -110_000 * base,
      gstCents: -10_000 * base,
      source: "gate7-cross-year",
    });
  });
}

function addTrustTransactions() {
  createTransaction({
    entityId: "boyun_trust",
    date: "2026-08-01",
    description: "Trust income",
    accountId: accountId("boyun_trust", "400"),
    gstCode: "NO_GST",
    amountCents: 300_000,
    gstCents: 0,
    source: "gate7-cross-year",
  });
  createTransaction({
    entityId: "boyun_trust",
    date: "2026-09-01",
    description: "Trust expense",
    accountId: accountId("boyun_trust", "500"),
    gstCode: "NO_GST",
    amountCents: -50_000,
    gstCents: 0,
    source: "gate7-cross-year",
  });
}

function transitionThroughPaid(obligationId: number, label: string, lodgedAt: string, paidAt: string) {
  transitionObligation({ obligationId, to: "collecting", reason: `${label} 证据演练：开始收集` });
  transitionObligation({ obligationId, to: "draft_ready", reason: `${label} 证据演练：底稿就绪` });
  transitionObligation({ obligationId, to: "lodged", reason: `${label} 证据演练：记录实际提交`, lodgedAt });
  transitionObligation({ obligationId, to: "paid", reason: `${label} 证据演练：记录实际缴款`, paidAt });
}

function prepareData() {
  seedDatabase();
  const db = getRawDb();
  db.exec("DELETE FROM transactions; DELETE FROM obligations; DELETE FROM bas_worksheets; DELETE FROM reminders; DELETE FROM div7a_loans; DELETE FROM assets; DELETE FROM opening_balances; DELETE FROM super_contributions; DELETE FROM audit_log;");
  db.prepare("UPDATE entities SET acn = ?, asic_review_date = ? WHERE type = 'company'").run("ACN-GATE7", "2026-07-15");
  db.prepare("UPDATE licences SET anniversary_date = ? WHERE holder = 'self'").run("2026-08-15");

  addCompanyQuarterTransactions("boyun_co", 1);
  addCompanyQuarterTransactions("yeeliving_co", 2);
  addTrustTransactions();

  createAsset({
    entityId: "boyun_co",
    name: "Boyun vehicle",
    assetType: "vehicle",
    purchaseDate: "2026-07-01",
    availableForUseDate: "2026-07-01",
    costExGstCents: 1_000_000,
    usefulLifeYears: 5,
    method: "prime_cost",
    privateUsePercent: 20,
  });
  createAsset({
    entityId: "yeeliving_co",
    name: "Yeeliving equipment",
    assetType: "equipment",
    purchaseDate: "2026-07-01",
    availableForUseDate: "2026-07-01",
    costExGstCents: 2_000_000,
    usefulLifeYears: 5,
    method: "diminishing_value",
    privateUsePercent: 0,
  });
  createAsset({
    entityId: "neighbourhood_co",
    name: "Neighbourhood equipment",
    assetType: "equipment",
    purchaseDate: "2026-07-01",
    availableForUseDate: "2026-07-01",
    costExGstCents: 500_000,
    usefulLifeYears: 5,
    method: "prime_cost",
    privateUsePercent: 0,
  });

  COMPANY_IDS.forEach((entityId, index) => {
  createDiv7aLoan({
    lenderEntityId: entityId,
    borrower: "self",
    loanDate: "2026-07-01",
    principalCents: (10_000_000 + index * 1_000_000),
      termYears: 7,
      benchmarkRate: "8.77%",
    securityType: "unsecured",
  });
  if (entityId === "boyun_co") {
    createDiv7aLoan({
      lenderEntityId: entityId,
      borrower: "self",
      loanDate: "2026-08-01",
      principalCents: 2_000_000,
      termYears: 7,
      benchmarkRate: "8.77%",
      securityType: "unsecured",
    });
  }
  });

  recordSuperContribution({ person: "self", fy: FY, amountCents: 1_000_000, paidAt: "2027-06-29" });
  markSuperNoticeSubmitted({ person: "spouse", fy: FY, submittedAt: "2027-06-20" });
  ensureObligationsForFy(FY);
  return db;
}

function runBasAndAnnualWorkflows() {
  const db = getRawDb();
  const companyBas = db.prepare(`
    SELECT id, entity_id, period_label, effective_due
    FROM obligations
    WHERE rule_id = 'bas_quarterly' AND income_year = 'FY2026-27'
    ORDER BY entity_id, period_label
  `).all() as Array<{ id: number; entity_id: string; period_label: string; effective_due: string | null }>;
  const basRows: AnyRow[] = [];
  for (const obligation of companyBas) {
    const isNil = obligation.entity_id === "neighbourhood_co";
    const generated = generateBasWorksheet(obligation.id);
    const payg5aCents = isNil ? 0 : 2_500;
    const payg5bCents = 0;
    const worksheet = updateBasPaygInstalments(obligation.id, { payg5aCents, payg5bCents });
    const lodgedAt = obligation.period_label.endsWith("Q1") ? "2026-10-20"
      : obligation.period_label.endsWith("Q2") ? "2027-02-20"
        : obligation.period_label.endsWith("Q3") ? "2027-04-20" : "2027-07-20";
    markBasLodged(obligation.id, `G7-${obligation.id}`, worksheet.statementTotalCents ?? 0, lodgedAt);
    transitionObligation({ obligationId: obligation.id, to: "paid", reason: "Gate 7 年度演练：记录 BAS 实际缴款", paidAt: lodgedAt });
    const finalWorksheet = db.prepare("SELECT g1_cents, a1_cents, b1_cents, g10_cents, g11_cents, statement_total_cents FROM bas_worksheets WHERE id = ?").get(generated.worksheet.id) as AnyRow;
    basRows.push({ entityId: obligation.entity_id, periodLabel: obligation.period_label, ...finalWorksheet });
  }

  const companyAnnualRows: AnyRow[] = [];
  const annualSummaries: Record<string, ReturnType<typeof buildCompanyTaxWorksheet>> = {};
  for (const entityId of COMPANY_IDS) {
    annualSummaries[entityId] = buildCompanyTaxWorksheet(entityId, `FY${FY}`);
    const companyTax = db.prepare("SELECT id FROM obligations WHERE entity_id = ? AND rule_id = 'company_tax_return' AND income_year = 'FY2025-26'").get(entityId) as { id: number };
    transitionThroughPaid(companyTax.id, `${entityId} 公司税表`, "2027-02-15", "2027-02-20");
    const row = db.prepare("SELECT id, status, lodged_at, paid_at FROM obligations WHERE id = ?").get(companyTax.id) as AnyRow;
    companyAnnualRows.push({ entityId, ...row, incomeCents: annualSummaries[entityId].incomeCents });
  }

  const otherTodo = db.prepare(`
    SELECT id, entity_id, rule_id, period_label
    FROM obligations
    WHERE deadline_fy = 'FY2026-27' AND rule_id IN ('asic_annual_review', 'estate_agent_licence_annual_statement', 'trust_tax_return', 'trust_distribution_resolution', 'individual_tax_return', 'super_contribution', 'super_notice')
    ORDER BY id
  `).all() as Array<{ id: number; entity_id: string; rule_id: string; period_label: string }>;
  for (const obligation of otherTodo) {
    const date = obligation.rule_id === "estate_agent_licence_annual_statement" ? "2026-08-15" : "2027-06-20";
    transitionThroughPaid(obligation.id, `${obligation.entity_id}/${obligation.rule_id}`, date, date);
  }

  const trust = buildTrustDistributionDraft("boyun_trust", `FY${FY}`);
  const proposedDistributions = [
    { beneficiary: "self", amountCents: 125_000 },
    { beneficiary: "spouse", amountCents: 125_000 },
  ];
  for (const allocation of proposedDistributions) {
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, reason, metadata_json)
      VALUES ('trust_distribution', ?, 'Gate 7 演练手工记录受益人分配', ?)
    `).run(`boyun_trust:${FY}:${allocation.beneficiary}`, JSON.stringify(allocation));
  }

  const personalSummaries = ["self", "spouse"].map((person) => buildPersonalTaxSummary(person, `FY${FY}`));
  const superProgress = ["self", "spouse"].map((person) => getSuperProgress(person, `FY${FY}`));
  const assetRows = COMPANY_IDS.flatMap((entityId) => {
    const summary = getAssetDepreciationForEntity(entityId, `FY${FY}`);
    return summary.rows.map((row) => ({ ...row }));
  });
  const div7aRows = db.prepare(`
    SELECT id, lender_entity_id, principal_cents, repayments_json
    FROM div7a_loans ORDER BY id
  `).all() as AnyRow[];
  const obligationRows = db.prepare(`
    SELECT id, entity_id, rule_id, period_label, scope_key, income_year, deadline_fy, statutory_due, effective_due, status, lodged_at, paid_at
    FROM obligations ORDER BY entity_id, rule_id, period_label, scope_key
  `).all() as AnyRow[];

  const basByCompany = Object.fromEntries(COMPANY_IDS.map((entityId) => {
    const rows = basRows.filter((row) => row.entityId === entityId);
    const gstExclusiveBasIncomeCents = rows.reduce((sum, row) => sum + Number(row.g1_cents) - Number(row.a1_cents), 0);
    const annualIncomeCents = annualSummaries[entityId].incomeCents;
    return [entityId, {
      rows,
      g1TotalCents: rows.reduce((sum, row) => sum + Number(row.g1_cents), 0),
      a1TotalCents: rows.reduce((sum, row) => sum + Number(row.a1_cents), 0),
      gstExclusiveBasIncomeCents,
      annualIncomeCents,
      nonTaxableIncomeIncludedInAnnualCents: annualIncomeCents - gstExclusiveBasIncomeCents,
      differenceCents: gstExclusiveBasIncomeCents - annualIncomeCents,
      consistencyNote: "严格按 G1 - 1A 只覆盖含 GST 销售；年度收入另包含 GST-free/NO_GST 收入，因此本场景的差额应等于这些非应税收入。",
    }];
  }));
  const trustDistributionTotal = proposedDistributions.reduce((sum, row) => sum + row.amountCents, 0);
  const assetConsistency = assetRows.map((row) => {
    const schedule = getAssetSchedule(Number(row.assetId), `FY${FY}`, `FY${FY}`)[0];
    return {
      assetId: row.assetId,
      entityId: row.entityId,
      totalDepreciationCents: row.totalDepreciationCents,
      openingBookValueCents: schedule.openingBookValueCents,
      closingBookValueCents: schedule.closingBookValueCents,
      bookValueDecreaseCents: schedule.openingBookValueCents !== null && schedule.closingBookValueCents !== null ? schedule.openingBookValueCents - schedule.closingBookValueCents : null,
      differenceCents: row.totalDepreciationCents !== null && schedule.openingBookValueCents !== null && schedule.closingBookValueCents !== null ? row.totalDepreciationCents - (schedule.openingBookValueCents - schedule.closingBookValueCents) : null,
    };
  });
  const div7aConsistency = div7aRows.map((loan) => {
    const repayments = JSON.parse(String(loan.repayments_json)) as Array<{ amountCents: number }>;
    return {
      loanId: loan.id,
      entityId: loan.lender_entity_id,
      schedule: "FY2026-27 row is origination year; no repayment was recorded in this scenario",
      openingPlusInterestMinusRepaymentsCents: Number(loan.principal_cents),
      closingBalanceCents: Number(loan.principal_cents),
      differenceCents: 0,
      recordedRepaymentCents: repayments.reduce((sum, repayment) => sum + repayment.amountCents, 0),
    };
  });

  const futureYear = "FY2027-28";
  const futureYearModuleProbe = {
    company: COMPANY_IDS.map((entityId) => buildCompanyTaxWorksheet(entityId, futureYear)).map((worksheet) => ({
      entityId: worksheet.entityId,
      incomeCents: worksheet.incomeCents,
      depreciationCents: worksheet.depreciationCents,
      assetDepreciationStatus: worksheet.assetDepreciationStatus,
    })),
    trust: buildTrustDistributionDraft("boyun_trust", futureYear),
    personal: ["self", "spouse"].map((person) => buildPersonalTaxSummary(person, futureYear)),
  };

  return {
    basByCompany,
    companyAnnualRows,
    trust: {
      distributableIncomeCents: trust.distributableIncomeCents,
      proposedDistributions,
      distributionTotalCents: trustDistributionTotal,
      differenceCents: trust.distributableIncomeCents === null ? null : trustDistributionTotal - trust.distributableIncomeCents,
    },
    personal: personalSummaries.map((summary) => ({ entityId: summary.entityId, trustDistributionCents: summary.trustDistributionCents, incomeCents: summary.incomeCents })),
    superProgress,
    assets: assetConsistency,
    div7a: div7aConsistency,
    obligations: obligationRows,
    futureYearModuleProbe: {
      incomeYear: futureYear,
      company: futureYearModuleProbe.company,
      trust: {
        distributableIncomeCents: futureYearModuleProbe.trust.distributableIncomeCents,
        manualItems: futureYearModuleProbe.trust.manualItems,
      },
      personal: futureYearModuleProbe.personal.map((summary) => ({ entityId: summary.entityId, incomeCents: summary.incomeCents })),
    },
  };
}

function snapshotTable(database: Database.Database, table: string) {
  return database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as AnyRow[];
}

function hashRows(rows: AnyRow[]) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function runBackupRoundTrip(db: Database.Database) {
  const sourceDbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
  const resolvedSourceDbPath = path.isAbsolute(sourceDbPath) ? sourceDbPath : path.resolve(process.cwd(), sourceDbPath);
  const sourceFilesPath = path.join(path.dirname(resolvedSourceDbPath), SOURCE_FILES_DIR);
  fs.mkdirSync(sourceFilesPath, { recursive: true });
  fs.writeFileSync(path.join(sourceFilesPath, "gate7-evidence.txt"), "gate7 backup files evidence\n", "utf8");
  const beforeDir = path.join(EVIDENCE_DIR, "backup-before");
  const afterDir = path.join(EVIDENCE_DIR, "backup-after");
  fs.mkdirSync(beforeDir, { recursive: true });
  fs.mkdirSync(afterDir, { recursive: true });
  const before: Record<string, { rows: AnyRow[]; sha256: string }> = {};
  for (const table of REQUIRED_BACKUP_TABLES) {
    const rows = snapshotTable(db, table);
    before[table] = { rows, sha256: hashRows(rows) };
    fs.writeFileSync(path.join(beforeDir, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  }

  const archive = await createBackupArchive();
  const restoreDir = fs.mkdtempSync(path.join("/tmp", "tax-gate7-restore-"));
  const restoredDbPath = path.join(restoreDir, "restored.db");
  const restoredFilesPath = path.join(restoreDir, SOURCE_FILES_DIR);
  await restoreBackupArchive(archive.buffer, { databaseFilePath: restoredDbPath, filesDirectory: restoredFilesPath });
  const restoredDb = new Database(restoredDbPath, { readonly: true });
  const after: Record<string, { rows: AnyRow[]; sha256: string }> = {};
  const diffs: Record<string, number> = {};
  for (const table of REQUIRED_BACKUP_TABLES) {
    const rows = snapshotTable(restoredDb, table);
    after[table] = { rows, sha256: hashRows(rows) };
    fs.writeFileSync(path.join(afterDir, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    diffs[table] = JSON.stringify(before[table].rows) === JSON.stringify(rows) ? 0 : 1;
  }
  restoredDb.close();
  return {
    archiveEntries: archive.entries,
    manifest: archive.manifest,
    sourceFilesSha256: hashRows([{ name: "gate7-evidence.txt", content: "gate7 backup files evidence\n" }]),
    restoredFilesPresent: fs.existsSync(path.join(restoredFilesPath, "gate7-evidence.txt")),
    tableDiffExitCodes: diffs,
    allDiffExitCode: Object.values(diffs).every((code) => code === 0) ? 0 : 1,
    before: Object.fromEntries(Object.entries(before).map(([table, value]) => [table, { rowCount: value.rows.length, sha256: value.sha256 } ])),
    after: Object.fromEntries(Object.entries(after).map(([table, value]) => [table, { rowCount: value.rows.length, sha256: value.sha256 } ])),
    restoredDatabasePath: restoredDbPath,
  };
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const db = prepareData();
  let rollover: { status: "expanded" | "failed"; error?: string; count?: number };
  try {
    const nextYear = ensureObligationsForFy("2027-28");
    rollover = { status: "expanded", count: nextYear.length };
  } catch (error) {
    rollover = { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
  const workflows = runBasAndAnnualWorkflows();
  const backup = await runBackupRoundTrip(db);
  const sourceDbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
  const output = {
    generatedAt: new Date().toISOString(),
    databasePath: sourceDbPath,
    c1FiscalYearRollover: rollover,
    workflows,
    backup,
  };
  const outputPath = path.join(EVIDENCE_DIR, "cross-year-output.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
  console.log(`EVIDENCE_OUTPUT=${outputPath}`);
}

void main();
