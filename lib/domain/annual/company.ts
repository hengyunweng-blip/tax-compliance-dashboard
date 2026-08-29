import { getRawDb } from "@/lib/db/client";
import { getAssetDepreciationForEntity } from "@/lib/domain/assets/service";
import { annualManualItemsForEntityType, annualTransactionLines, normalizeIncomeYear, sumCents, type AnnualTransactionLine } from "@/lib/domain/annual/shared";

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
  netProfitCents: number | null;
  manualItems: string[];
};

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
    netProfitCents,
    manualItems: annualManualItemsForEntityType(entity.type),
  };
}
