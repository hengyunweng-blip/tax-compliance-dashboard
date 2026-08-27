import { getRawDb } from "@/lib/db/client";
import { ANNUAL_MANUAL_ITEMS, annualTransactionLines, normalizeIncomeYear, sumCents, type AnnualTransactionLine } from "@/lib/domain/annual/shared";

export type CompanyTaxWorksheet = {
  entityId: string;
  entityName: string;
  incomeYear: string;
  transactionIds: number[];
  transactions: AnnualTransactionLine[];
  incomeCents: number;
  operatingExpenseCents: number;
  capitalPurchaseCents: number;
  netProfitCents: number;
  manualItems: string[];
};

export function buildCompanyTaxWorksheet(entityId: string, incomeYear: string): CompanyTaxWorksheet {
  const normalizedIncomeYear = normalizeIncomeYear(incomeYear);
  const entity = getRawDb().prepare("SELECT id, name, type FROM entities WHERE id = ? AND active = 1").get(entityId) as { id: string; name: string; type: string } | undefined;
  if (!entity) throw new Error(`Entity not found: ${entityId}`);
  if (entity.type !== "company") throw new Error(`Entity is not a company: ${entityId}`);

  const transactions = annualTransactionLines(entityId, normalizedIncomeYear);
  const incomeCents = sumCents(transactions.filter((item) => item.accountType === "income").map((item) => item.amountCents));
  const operatingExpenseCents = sumCents(transactions.filter((item) => item.accountType === "expense").map((item) => item.amountCents));
  const capitalPurchaseCents = sumCents(transactions
    .filter((item) => item.gstCode === "GST_CAPITAL" || item.accountCode === "510")
    .map((item) => Math.abs(item.amountCents)));

  return {
    entityId,
    entityName: entity.name,
    incomeYear: normalizedIncomeYear,
    transactionIds: transactions.map((item) => item.id),
    transactions,
    incomeCents,
    operatingExpenseCents,
    capitalPurchaseCents,
    netProfitCents: sumCents([incomeCents, operatingExpenseCents]),
    manualItems: [...ANNUAL_MANUAL_ITEMS],
  };
}
