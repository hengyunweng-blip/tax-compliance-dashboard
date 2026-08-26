import { summarizeBas, type BasPaygInput, type BasSummary, type BasTransactionInput } from "@/lib/domain/bas/gst-mapping";

export type { BasPaygInput, BasSummary, BasTransactionInput } from "@/lib/domain/bas/gst-mapping";

export function calculateBasSummary(transactions: BasTransactionInput[], payg: BasPaygInput | number | null = null): BasSummary {
  return summarizeBas(transactions, payg);
}

export { summarizeBas } from "@/lib/domain/bas/gst-mapping";
