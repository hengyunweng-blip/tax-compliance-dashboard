import { summarizeBas, type BasSummary, type BasTransactionInput } from "@/lib/domain/bas/gst-mapping";

export type { BasSummary, BasTransactionInput } from "@/lib/domain/bas/gst-mapping";

export function calculateBasSummary(transactions: BasTransactionInput[], paygInstalmentCents: number | null = null): BasSummary {
  return summarizeBas(transactions, paygInstalmentCents);
}

export { summarizeBas } from "@/lib/domain/bas/gst-mapping";
