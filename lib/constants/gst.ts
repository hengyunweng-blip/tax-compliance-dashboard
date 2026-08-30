export const GST_CODES = [
  "GST_INCOME",
  "GST_FREE_INCOME",
  "INPUT_TAXED",
  "NOT_A_SUPPLY",
  "GST_EXPENSE",
  "GST_CAPITAL",
  "NO_GST",
  "PRIVATE",
] as const;

export type GstCode = (typeof GST_CODES)[number];

/** Income accounts distinguish a GST-free sale from a receipt that is not a supply. */
export function availableGstCodesForAccountType(accountType: string): GstCode[] {
  if (accountType === "income") return ["GST_INCOME", "GST_FREE_INCOME", "INPUT_TAXED", "NOT_A_SUPPLY"];
  if (accountType === "expense") return ["GST_EXPENSE", "NO_GST", "PRIVATE"];
  if (accountType === "asset") return ["GST_CAPITAL", "NO_GST"];
  return ["NOT_A_SUPPLY", "NO_GST", "PRIVATE"];
}
