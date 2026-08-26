import type { GstCode } from "@/lib/constants/gst";

export type AiDegradedReason = "ai_disabled" | "ai_not_configured" | "ai_provider_error" | "ai_timeout";

export type InvoiceExtraction = {
  supplier: string | null;
  invoiceDate: string | null;
  totalCents: number | null;
  gstCents: number | null;
  confidence: "high" | "medium" | "low";
  modelUsed: string;
  degradedReason?: AiDegradedReason;
};

export type ClassificationSuggestion = {
  accountCode: string | null;
  gstCode: GstCode | null;
  confidence: "high" | "medium" | "low";
  reviewFlag: boolean;
  reason: string;
  modelUsed: string;
  degradedReason?: AiDegradedReason;
};

export type NewsAnalysis = {
  newsItemId: number;
  affectedEntities: string[];
  impactLevel: "action" | "watch" | "none";
  summary: string;
  recommendations: string[];
  modelUsed: string;
  degradedReason?: AiDegradedReason;
};

export type ObligationExplanation = {
  obligationId: number;
  summary: string;
  checklist: string[];
  modelUsed: string;
  degradedReason?: AiDegradedReason;
};
