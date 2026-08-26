import type { GstCode } from "@/lib/constants/gst";

export type ClassificationSuggestion = {
  accountCode: string | null;
  gstCode: GstCode | null;
  confidence: "high" | "medium" | "low";
  reviewFlag: boolean;
  reason: string;
};

export function classifyTransaction(
  row: { description?: string; counterparty?: string | null },
  _entityContext: { entityId: string },
): ClassificationSuggestion {
  const text = `${row.description ?? ""} ${row.counterparty ?? ""}`.toLowerCase();
  if (/realestate|real estate|commission|sales fee|agency fee/.test(text)) {
    return { accountCode: "400", gstCode: "GST_INCOME", confidence: "high", reviewFlag: false, reason: "地产佣金/销售费用关键词" };
  }
  if (/student|rent|room|accommodation|service fee/.test(text)) {
    return { accountCode: "410", gstCode: "GST_INCOME", confidence: "medium", reviewFlag: true, reason: "租房服务收入关键词，需人工确认" };
  }
  if (/private|personal|drawings/.test(text)) {
    return { accountCode: "600", gstCode: "PRIVATE", confidence: "high", reviewFlag: false, reason: "私人用途关键词" };
  }
  if (/equipment|computer|vehicle|capital|renovation/.test(text)) {
    return { accountCode: "510", gstCode: "GST_CAPITAL", confidence: "medium", reviewFlag: true, reason: "资本采购关键词，需人工确认" };
  }
  return { accountCode: null, gstCode: null, confidence: "low", reviewFlag: true, reason: "没有匹配到确定规则" };
}
