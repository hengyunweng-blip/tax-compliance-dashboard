import { getRawDb } from "@/lib/db/client";
import { assertIntegerCents } from "@/lib/money";
import { getAssetDepreciationForEntity } from "@/lib/domain/assets/service";
import { annualManualItemsForEntityType, annualTransactionLines, normalizeIncomeYear, sumCents, type AnnualTransactionLine } from "@/lib/domain/annual/shared";

export type PersonalTaxSummary = {
  entityId: string;
  entityName: string;
  incomeYear: string;
  transactionIds: number[];
  transactions: AnnualTransactionLine[];
  incomeCents: number;
  expenseCents: number;
  depreciationCents: number | null;
  deductibleDepreciationCents: number | null;
  assetDepreciationStatus: "ready" | "manual_review";
  assetDepreciationRows: ReturnType<typeof getAssetDepreciationForEntity>["rows"];
  trustDistributionCents: number;
  dividendCents: number;
  frankingCreditsCents: number;
  concessionalContributionsCents: number;
  noticeSubmitted: boolean;
  manualItems: string[];
};

export function buildPersonalTaxSummary(person: string, incomeYear: string): PersonalTaxSummary {
  const normalizedIncomeYear = normalizeIncomeYear(incomeYear);
  const entity = getRawDb().prepare("SELECT id, name, type FROM entities WHERE id = ? AND active = 1").get(person) as { id: string; name: string; type: string } | undefined;
  if (!entity) throw new Error(`Entity not found: ${person}`);
  if (entity.type !== "individual") throw new Error(`Entity is not an individual: ${person}`);

  const transactions = annualTransactionLines(person, normalizedIncomeYear);
  const incomeCents = sumCents(transactions.filter((item) => item.accountType === "income").map((item) => item.amountExcludingGstCents));
  const expenseCents = sumCents(transactions.filter((item) => item.accountType === "expense").map((item) => item.amountExcludingGstCents));
  const row = getRawDb().prepare(`
    SELECT COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN amount_cents ELSE 0 END), 0) AS contributed_cents,
      MAX(notice_submitted_at) AS notice_submitted_at
    FROM super_contributions
    WHERE person = ? AND fy = ?
  `).get(person, normalizedIncomeYear.replace(/^FY/, "")) as { contributed_cents: number; notice_submitted_at: string | null };
  assertIntegerCents(row.contributed_cents);
  const assetDepreciation = getAssetDepreciationForEntity(person, normalizedIncomeYear);

  return {
    entityId: person,
    entityName: entity.name,
    incomeYear: normalizedIncomeYear,
    transactionIds: transactions.map((item) => item.id),
    transactions,
    incomeCents,
    expenseCents,
    depreciationCents: assetDepreciation.totalDepreciationCents,
    deductibleDepreciationCents: assetDepreciation.deductibleDepreciationCents,
    assetDepreciationStatus: assetDepreciation.status,
    assetDepreciationRows: assetDepreciation.rows,
    // These are intentionally manual until the source data model has explicit
    // distribution/dividend documents; no annual filing is generated here.
    trustDistributionCents: 0,
    dividendCents: 0,
    frankingCreditsCents: 0,
    concessionalContributionsCents: row.contributed_cents,
    noticeSubmitted: Boolean(row.notice_submitted_at),
    manualItems: annualManualItemsForEntityType(entity.type),
  };
}
