import { getRawDb } from "@/lib/db/client";
import { mapTransactionToBas } from "@/lib/domain/bas/gst-mapping";
import type { BasLineItem } from "@/lib/domain/bas/generator";
import { getAssetDepreciationForEntity } from "@/lib/domain/assets/service";
import { annualManualItemsForEntityType, annualTransactionLines, normalizeIncomeYear, sumCents, type AnnualTransactionLine } from "@/lib/domain/annual/shared";
import { assertIntegerCents } from "@/lib/money";

export type CompanyTaxWorksheet = {
  entityId: string;
  entityName: string;
  incomeYear: string;
  transactionIds: number[];
  transactions: AnnualTransactionLine[];
  incomeCents: number;
  operatingExpenseCents: number;
  capitalPurchaseCents: number;
  depreciationCents: number | null;
  deductibleDepreciationCents: number | null;
  assetDepreciationStatus: "ready" | "manual_review";
  assetDepreciationRows: ReturnType<typeof getAssetDepreciationForEntity>["rows"];
  reconciliation: AnnualReconciliation;
  netProfitCents: number | null;
  manualItems: string[];
};

export type AnnualReconciliationGroup = {
  gstCode: string;
  basG1Cents: number;
  bas1ACents: number;
  annualIncomeCents: number;
  differenceCents: number;
};

export type AnnualReconciliation = {
  basG1Cents: number;
  bas1ACents: number;
  basNetCents: number;
  annualIncomeCents: number;
  differenceCents: number;
  groups: AnnualReconciliationGroup[];
  confirmed: boolean;
};

function buildReconciliation(entityId: string, incomeYear: string, transactions: AnnualTransactionLine[], annualIncomeCents: number): AnnualReconciliation {
  const groups = new Map<string, AnnualReconciliationGroup>();
  for (const transaction of transactions) {
    const group = groups.get(transaction.gstCode) ?? {
      gstCode: transaction.gstCode,
      basG1Cents: 0,
      bas1ACents: 0,
      annualIncomeCents: 0,
      differenceCents: 0,
    };
    if (transaction.accountType === "income") group.annualIncomeCents += transaction.amountExcludingGstCents;
    groups.set(transaction.gstCode, group);
  }
  const worksheetRows = getRawDb().prepare(`
    SELECT w.snapshot_json
    FROM bas_worksheets w
    INNER JOIN obligations o ON o.id = w.obligation_id
    WHERE o.entity_id = ? AND o.income_year = ?
    ORDER BY o.period_start, w.id
  `).all(entityId, normalizeIncomeYear(incomeYear)) as Array<{ snapshot_json: string }>;
  const basLines: BasLineItem[] = [];
  for (const row of worksheetRows) {
    try {
      const snapshot = JSON.parse(row.snapshot_json) as { lines?: unknown };
      if (Array.isArray(snapshot.lines)) {
        for (const line of snapshot.lines) {
          if (line && typeof line === "object" && "gstCode" in line) basLines.push(line as BasLineItem);
        }
      }
    } catch {
      // A malformed historical snapshot is represented by the reconciliation
      // difference; it is never silently replaced by a guessed amount.
    }
  }
  if (worksheetRows.length === 0) {
    for (const transaction of transactions) {
      const contribution = mapTransactionToBas(transaction);
      const group = groups.get(transaction.gstCode);
      if (!group) continue;
      group.basG1Cents += contribution.g1Cents;
      group.bas1ACents += contribution.a1Cents;
    }
  } else {
    for (const line of basLines) {
      const group = groups.get(line.gstCode) ?? {
        gstCode: line.gstCode,
        basG1Cents: 0,
        bas1ACents: 0,
        annualIncomeCents: 0,
        differenceCents: 0,
      };
      group.basG1Cents += line.g1Cents;
      group.bas1ACents += line.a1Cents;
      groups.set(line.gstCode, group);
    }
  }
  for (const group of groups.values()) group.differenceCents = group.basG1Cents - group.bas1ACents - group.annualIncomeCents;
  const basG1Cents = [...groups.values()].reduce((total, group) => total + group.basG1Cents, 0);
  const bas1ACents = [...groups.values()].reduce((total, group) => total + group.bas1ACents, 0);
  const differenceCents = basG1Cents - bas1ACents - annualIncomeCents;
  const targetId = `${entityId}:${normalizeIncomeYear(incomeYear)}`;
  const confirmed = Boolean(getRawDb().prepare("SELECT id FROM audit_log WHERE target_type = 'annual_reconciliation' AND target_id = ? ORDER BY id DESC LIMIT 1").get(targetId));
  return { basG1Cents, bas1ACents, basNetCents: basG1Cents - bas1ACents, annualIncomeCents, differenceCents, groups: [...groups.values()], confirmed };
}

export function buildCompanyTaxWorksheet(entityId: string, incomeYear: string): CompanyTaxWorksheet {
  const normalizedIncomeYear = normalizeIncomeYear(incomeYear);
  const entity = getRawDb().prepare("SELECT id, name, type FROM entities WHERE id = ? AND active = 1").get(entityId) as { id: string; name: string; type: string } | undefined;
  if (!entity) throw new Error(`Entity not found: ${entityId}`);
  if (entity.type !== "company") throw new Error(`Entity is not a company: ${entityId}`);

  const transactions = annualTransactionLines(entityId, normalizedIncomeYear);
  const incomeCents = sumCents(transactions.filter((item) => item.accountType === "income").map((item) => item.amountExcludingGstCents));
  const operatingExpenseCents = sumCents(transactions.filter((item) => item.accountType === "expense").map((item) => item.amountExcludingGstCents));
  const capitalPurchaseCents = sumCents(transactions
    .filter((item) => item.gstCode === "GST_CAPITAL" || item.accountCode === "510")
    .map((item) => Math.abs(item.amountExcludingGstCents)));
  const assetDepreciation = getAssetDepreciationForEntity(entityId, normalizedIncomeYear);
  const reconciliation = buildReconciliation(entityId, normalizedIncomeYear, transactions, incomeCents);
  const netProfitCents = assetDepreciation.deductibleDepreciationCents === null
    ? null
    : sumCents([incomeCents, operatingExpenseCents, -assetDepreciation.deductibleDepreciationCents]);

  return {
    entityId,
    entityName: entity.name,
    incomeYear: normalizedIncomeYear,
    transactionIds: transactions.map((item) => item.id),
    transactions,
    incomeCents,
    operatingExpenseCents,
    capitalPurchaseCents,
    depreciationCents: assetDepreciation.totalDepreciationCents,
    deductibleDepreciationCents: assetDepreciation.deductibleDepreciationCents,
    assetDepreciationStatus: assetDepreciation.status,
    assetDepreciationRows: assetDepreciation.rows,
    reconciliation,
    netProfitCents,
    manualItems: annualManualItemsForEntityType(entity.type),
  };
}

export function buildAnnualReconciliation(entityId: string, incomeYear: string) {
  return buildCompanyTaxWorksheet(entityId, incomeYear).reconciliation;
}

export function confirmAnnualReconciliation(input: { entityId: string; incomeYear: string; explanation: string; enteredBy: string }) {
  const worksheet = buildCompanyTaxWorksheet(input.entityId, input.incomeYear);
  const explanation = input.explanation.trim();
  const enteredBy = input.enteredBy.trim();
  if (worksheet.reconciliation.differenceCents !== 0 && !explanation) {
    throw new Error("年度对账差额不为零时必须逐项确认或填写原因");
  }
  if (!enteredBy) throw new Error("年度对账确认人不能为空");
  assertIntegerCents(worksheet.reconciliation.differenceCents);
  getRawDb().prepare(`
    INSERT INTO audit_log (target_type, target_id, reason, metadata_json)
    VALUES ('annual_reconciliation', ?, ?, ?)
  `).run(
    `${input.entityId}:${worksheet.incomeYear}`,
    explanation || "年度 BAS 与税务底稿对账差额为 0，已确认",
    JSON.stringify({ enteredBy, reconciliation: worksheet.reconciliation }),
  );
  return buildAnnualReconciliation(input.entityId, worksheet.incomeYear);
}
