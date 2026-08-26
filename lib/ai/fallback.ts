import { classifyTransaction as classifyWithRules } from "@/lib/rules/classification";
import type { ClassificationSuggestion, InvoiceExtraction, NewsAnalysis, ObligationExplanation, AiDegradedReason } from "@/lib/ai/types";

export function fallbackInvoice(reason: AiDegradedReason): InvoiceExtraction {
  return { supplier: null, invoiceDate: null, totalCents: null, gstCents: null, confidence: "low", modelUsed: "manual-fallback", degradedReason: reason };
}

export function fallbackClassification(row: { description?: string; counterparty?: string | null }, entityContext: { entityId: string }, reason: AiDegradedReason): ClassificationSuggestion {
  return { ...classifyWithRules(row, entityContext), modelUsed: "keyword-rules", degradedReason: reason };
}

export function fallbackNewsAnalysis(items: Array<{ id: number }>, reason: AiDegradedReason, entityIds: string[] = []): NewsAnalysis[] {
  return items.map((item) => ({
    newsItemId: item.id,
    affectedEntities: entityIds,
    impactLevel: "none",
    summary: "AI 未生成分析；请打开原文并由人工判断是否影响本主体。",
    recommendations: [],
    modelUsed: "source-only",
    degradedReason: reason,
  }));
}

export function fallbackObligationExplanation(obligationId: number, reason: AiDegradedReason): ObligationExplanation {
  return {
    obligationId,
    summary: "AI 未生成解释，请按义务页面的静态准备清单处理。",
    checklist: [],
    modelUsed: "static-checklist",
    degradedReason: reason,
  };
}
