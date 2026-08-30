import { getRawDb } from "@/lib/db/client";
import { getAssetDepreciationForEntity } from "@/lib/domain/assets/service";
import { annualManualItemsForEntityType, annualTransactionLines, normalizeIncomeYear, sumCents, type AnnualTransactionLine } from "@/lib/domain/annual/shared";
import { listTrustDistributions, type TrustDistribution } from "@/lib/domain/annual/trust-distributions";

export type TrustDistributionDraft = {
  entityId: string;
  entityName: string;
  incomeYear: string;
  transactionIds: number[];
  transactions: AnnualTransactionLine[];
  distributableIncomeCents: number | null;
  depreciationCents: number | null;
  deductibleDepreciationCents: number | null;
  assetDepreciationStatus: "ready" | "manual_review";
  assetDepreciationRows: ReturnType<typeof getAssetDepreciationForEntity>["rows"];
  beneficiaryAllocations: Array<Pick<TrustDistribution, "beneficiaryEntityId" | "beneficiaryName" | "amountCents" | "resolutionDate" | "status" | "statusLabel" | "sourceDescription"> & { beneficiary: string }>;
  distributionTotalCents: number;
  distributionDifferenceCents: number | null;
  distributionDifferenceConfirmed: boolean;
  resolutionText: string;
  manualItems: string[];
};

export function buildTrustDistributionDraft(entityId: string, incomeYear: string): TrustDistributionDraft {
  const normalizedIncomeYear = normalizeIncomeYear(incomeYear);
  const entity = getRawDb().prepare("SELECT id, name, type FROM entities WHERE id = ? AND active = 1").get(entityId) as { id: string; name: string; type: string } | undefined;
  if (!entity) throw new Error(`Entity not found: ${entityId}`);
  if (entity.type !== "trust") throw new Error(`Entity is not a trust: ${entityId}`);

  const transactions = annualTransactionLines(entityId, normalizedIncomeYear);
  const income = sumCents(transactions.filter((item) => item.accountType === "income").map((item) => item.amountExcludingGstCents));
  const expenses = sumCents(transactions.filter((item) => item.accountType === "expense").map((item) => item.amountExcludingGstCents));
  const assetDepreciation = getAssetDepreciationForEntity(entityId, normalizedIncomeYear);
  const distributableIncomeCents = assetDepreciation.deductibleDepreciationCents === null
    ? null
    : sumCents([income, expenses, -assetDepreciation.deductibleDepreciationCents]);
  const distributions = listTrustDistributions({ trustEntityId: entityId, incomeYear: normalizedIncomeYear });
  const distributionTotalCents = sumCents(distributions.map((distribution) => distribution.amountCents));
  const distributionDifferenceCents = distributableIncomeCents === null ? null : distributionTotalCents - distributableIncomeCents;
  const distributionDifferenceConfirmed = Boolean(getRawDb().prepare(`
    SELECT id FROM audit_log
    WHERE target_type = 'trust_distribution_reconciliation' AND target_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(`${entityId}:${normalizedIncomeYear}`));

  return {
    entityId,
    entityName: entity.name,
    incomeYear: normalizedIncomeYear,
    transactionIds: transactions.map((item) => item.id),
    transactions,
    distributableIncomeCents,
    depreciationCents: assetDepreciation.totalDepreciationCents,
    deductibleDepreciationCents: assetDepreciation.deductibleDepreciationCents,
    assetDepreciationStatus: assetDepreciation.status,
    assetDepreciationRows: assetDepreciation.rows,
    beneficiaryAllocations: distributions.map((distribution) => ({
      beneficiary: distribution.beneficiaryEntityId,
      beneficiaryEntityId: distribution.beneficiaryEntityId,
      beneficiaryName: distribution.beneficiaryName,
      amountCents: distribution.amountCents,
      resolutionDate: distribution.resolutionDate,
      status: distribution.status,
      statusLabel: distribution.statusLabel,
      sourceDescription: distribution.sourceDescription,
    })),
    distributionTotalCents,
    distributionDifferenceCents,
    distributionDifferenceConfirmed,
    resolutionText: `FY${normalizedIncomeYear.replace(/^FY/, "").replace("-", "–")} 信托分配决议草稿\n\n本决议须由受托人核对受益人、金额及 FTE 状态后签署并留存。系统不会自动签署或提交。`,
    manualItems: annualManualItemsForEntityType(entity.type),
  };
}
