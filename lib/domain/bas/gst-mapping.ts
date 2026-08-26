import { GST_CODES, type GstCode } from "@/lib/constants/gst";
import { assertIntegerCents } from "@/lib/money";

export type BasLineContribution = {
  g1Cents: number;
  a1Cents: number;
  b1Cents: number;
  g10Cents: number;
  g11Cents: number;
};

export type BasTransactionInput = {
  id?: number;
  entityId?: string | null;
  accountId?: number | null;
  reviewFlag?: boolean;
  gstCode?: string;
  amountCents: number;
  gstCents: number;
};

export type BasSummary = BasLineContribution & {
  paygInstalmentCents: number | null;
  gstNetCents: number;
  statementTotalCents: number | null;
  warnings: string[];
};

function assertGstCode(value: string | undefined): asserts value is GstCode {
  if (!value || !GST_CODES.includes(value as GstCode)) {
    throw new Error(`Invalid GST code: ${value ?? ""}`);
  }
}

function absoluteCents(value: number) {
  assertIntegerCents(value);
  return Math.abs(value);
}

export function mapTransactionToBas(transaction: Pick<BasTransactionInput, "gstCode" | "amountCents" | "gstCents">): BasLineContribution {
  assertIntegerCents(transaction.amountCents);
  assertIntegerCents(transaction.gstCents);
  assertGstCode(transaction.gstCode);

  switch (transaction.gstCode) {
    case "GST_INCOME":
      return { g1Cents: transaction.amountCents, a1Cents: transaction.gstCents, b1Cents: 0, g10Cents: 0, g11Cents: 0 };
    case "GST_FREE_INCOME":
    case "INPUT_TAXED":
      return { g1Cents: transaction.amountCents, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 };
    case "GST_EXPENSE":
      return { g1Cents: 0, a1Cents: 0, b1Cents: absoluteCents(transaction.gstCents), g10Cents: 0, g11Cents: absoluteCents(transaction.amountCents) };
    case "GST_CAPITAL":
      return { g1Cents: 0, a1Cents: 0, b1Cents: absoluteCents(transaction.gstCents), g10Cents: absoluteCents(transaction.amountCents), g11Cents: 0 };
    case "NO_GST":
    case "PRIVATE":
      return { g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 };
  }
}

export function basTransactionWarning(transaction: BasTransactionInput): string | null {
  const label = transaction.id === undefined ? "交易" : `交易 ${transaction.id}`;
  if (transaction.reviewFlag) return `${label} 待确认`;
  if (!transaction.entityId?.trim()) return `${label} 缺少主体`;
  if (!Number.isSafeInteger(transaction.accountId) || (transaction.accountId ?? 0) <= 0) return `${label} 缺少科目`;
  if (!transaction.gstCode) return `${label} 缺少 GST 代码`;
  return null;
}

export function summarizeBas(transactions: BasTransactionInput[], paygInstalmentCents: number | null = null): BasSummary {
  if (paygInstalmentCents !== null) assertIntegerCents(paygInstalmentCents);
  const summary: BasSummary = {
    g1Cents: 0,
    a1Cents: 0,
    b1Cents: 0,
    g10Cents: 0,
    g11Cents: 0,
    paygInstalmentCents,
    gstNetCents: 0,
    statementTotalCents: null,
    warnings: [],
  };

  for (const transaction of transactions) {
    const warning = basTransactionWarning(transaction);
    if (warning) {
      summary.warnings.push(warning);
      continue;
    }
    try {
      const contribution = mapTransactionToBas(transaction);
      summary.g1Cents += contribution.g1Cents;
      summary.a1Cents += contribution.a1Cents;
      summary.b1Cents += contribution.b1Cents;
      summary.g10Cents += contribution.g10Cents;
      summary.g11Cents += contribution.g11Cents;
    } catch (error) {
      summary.warnings.push(error instanceof Error ? error.message : "交易无法归入 BAS");
    }
  }

  summary.gstNetCents = summary.a1Cents - summary.b1Cents;
  summary.statementTotalCents = paygInstalmentCents === null ? null : summary.gstNetCents + paygInstalmentCents;
  assertIntegerCents(summary.g1Cents);
  assertIntegerCents(summary.a1Cents);
  assertIntegerCents(summary.b1Cents);
  assertIntegerCents(summary.g10Cents);
  assertIntegerCents(summary.g11Cents);
  assertIntegerCents(summary.gstNetCents);
  if (summary.statementTotalCents !== null) assertIntegerCents(summary.statementTotalCents);
  return summary;
}
