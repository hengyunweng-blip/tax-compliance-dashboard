export const GST_CODES = [
  "GST_INCOME",
  "GST_FREE_INCOME",
  "INPUT_TAXED",
  "GST_EXPENSE",
  "GST_CAPITAL",
  "NO_GST",
  "PRIVATE",
] as const;

export type GstCode = (typeof GST_CODES)[number];
