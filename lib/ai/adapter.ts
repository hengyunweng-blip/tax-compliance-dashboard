import { GST_CODES, type GstCode } from "@/lib/constants/gst";
import { getAiConfig } from "@/lib/ai/config";
import { getOrCreateAiCache, type AiProduced } from "@/lib/ai/cache";
import { fallbackClassification, fallbackInvoice, fallbackNewsAnalysis, fallbackObligationExplanation } from "@/lib/ai/fallback";
import type { AiDegradedReason, ClassificationSuggestion, InvoiceExtraction, NewsAnalysis, ObligationExplanation } from "@/lib/ai/types";
import { redactSensitiveValue } from "@/lib/ai/redact";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeIntegerOrNull(value: unknown): number | null | undefined {
  return value === null ? null : Number.isSafeInteger(value) ? value as number : undefined;
}

function confidence(value: unknown): "high" | "medium" | "low" | undefined {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function parseClassification(value: unknown): Omit<ClassificationSuggestion, "modelUsed" | "degradedReason"> | null {
  if (!isRecord(value)) return null;
  const gstCode = value.gstCode === null ? null : typeof value.gstCode === "string" && GST_CODES.includes(value.gstCode as GstCode) ? value.gstCode as GstCode : undefined;
  const level = confidence(value.confidence);
  if (gstCode === undefined || (value.accountCode !== null && typeof value.accountCode !== "string") || level === undefined || typeof value.reviewFlag !== "boolean" || typeof value.reason !== "string") return null;
  return { accountCode: value.accountCode as string | null, gstCode, confidence: level, reviewFlag: value.reviewFlag, reason: value.reason };
}

function parseInvoice(value: unknown): Omit<InvoiceExtraction, "modelUsed" | "degradedReason"> | null {
  if (!isRecord(value)) return null;
  const totalCents = safeIntegerOrNull(value.totalCents);
  const gstCents = safeIntegerOrNull(value.gstCents);
  const level = confidence(value.confidence);
  if (totalCents === undefined || gstCents === undefined || level === undefined || (value.supplier !== null && typeof value.supplier !== "string") || (value.invoiceDate !== null && typeof value.invoiceDate !== "string")) return null;
  return { supplier: value.supplier as string | null, invoiceDate: value.invoiceDate as string | null, totalCents, gstCents, confidence: level };
}

function parseNews(value: unknown): Array<Omit<NewsAnalysis, "modelUsed" | "degradedReason">> | null {
  const values = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.analyses) ? value.analyses : null;
  if (!values) return null;
  const parsed: Array<Omit<NewsAnalysis, "modelUsed" | "degradedReason">> = [];
  for (const item of values) {
    if (!isRecord(item) || !Number.isSafeInteger(item.newsItemId) || !Array.isArray(item.affectedEntities) || !item.affectedEntities.every((entity) => typeof entity === "string") || !["action", "watch", "none"].includes(item.impactLevel as string) || typeof item.summary !== "string" || !Array.isArray(item.recommendations) || !item.recommendations.every((recommendation) => typeof recommendation === "string")) return null;
    parsed.push({
      newsItemId: item.newsItemId as number,
      affectedEntities: item.affectedEntities as string[],
      impactLevel: item.impactLevel as "action" | "watch" | "none",
      summary: item.summary,
      recommendations: item.recommendations as string[],
    });
  }
  return parsed;
}

function parseObligation(value: unknown, obligationId: number): Omit<ObligationExplanation, "modelUsed" | "degradedReason"> | null {
  if (!isRecord(value) || typeof value.summary !== "string" || !Array.isArray(value.checklist) || !value.checklist.every((item) => typeof item === "string")) return null;
  return { obligationId, summary: value.summary, checklist: value.checklist as string[] };
}

async function providerCall<T>(method: string, input: unknown, parse: (value: unknown) => T | null, fallback: (reason: AiDegradedReason) => T): Promise<AiProduced<T>> {
  const config = getAiConfig();
  if (!config.enabled) return { output: fallback("ai_disabled"), modelUsed: "fallback" };
  if (!config.endpoint || !config.apiKey) return { output: fallback("ai_not_configured"), modelUsed: "fallback" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ method, input: redactSensitiveValue(input) }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const parsed = parse(await response.json() as unknown);
    if (parsed === null) throw new Error("AI provider response did not match the expected schema");
    return { output: parsed, modelUsed: config.model };
  } catch (error) {
    return { output: fallback(error instanceof DOMException && error.name === "AbortError" ? "ai_timeout" : "ai_provider_error"), modelUsed: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractInvoice(fileRef: unknown): Promise<InvoiceExtraction> {
  const result = await getOrCreateAiCache<InvoiceExtraction>("extractInvoice", fileRef, () => providerCall("extractInvoice", fileRef, (value) => {
    const parsed = parseInvoice(value);
    return parsed ? { ...parsed, modelUsed: getAiConfig().model } : null;
  }, fallbackInvoice));
  return result.value;
}

export async function classifyTransaction(row: { description?: string; counterparty?: string | null; [key: string]: unknown }, entityContext: { entityId: string; [key: string]: unknown }): Promise<ClassificationSuggestion> {
  const input = { row, entityContext };
  const result = await getOrCreateAiCache<ClassificationSuggestion>("classifyTransaction", input, () => providerCall("classifyTransaction", input, (value) => {
    const parsed = parseClassification(value);
    return parsed ? { ...parsed, modelUsed: getAiConfig().model } : null;
  }, (reason) => fallbackClassification(row, entityContext, reason)));
  return result.value;
}

export async function summarizeNews(items: Array<{ id: number; title?: string; rawText?: string; [key: string]: unknown }>, profile: { entityIds?: string[]; [key: string]: unknown }): Promise<NewsAnalysis[]> {
  const input = { items, profile };
  const result = await getOrCreateAiCache<NewsAnalysis[]>("summarizeNews", input, () => providerCall("summarizeNews", input, (value) => {
    const parsed = parseNews(value);
    return parsed ? parsed.map((item) => ({ ...item, modelUsed: getAiConfig().model })) : null;
  }, (reason) => fallbackNewsAnalysis(items, reason, profile.entityIds ?? [])));
  return result.value;
}

export async function explainObligation(obligationId: number): Promise<ObligationExplanation> {
  const input = { obligationId };
  const result = await getOrCreateAiCache<ObligationExplanation>("explainObligation", input, () => providerCall("explainObligation", input, (value) => {
    const parsed = parseObligation(value, obligationId);
    return parsed ? { ...parsed, modelUsed: getAiConfig().model } : null;
  }, (reason) => fallbackObligationExplanation(obligationId, reason)));
  return result.value;
}
