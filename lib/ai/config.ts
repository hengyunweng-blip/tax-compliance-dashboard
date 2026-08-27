import aiDefaults from "@/config/ai.json";

export type AiConfig = {
  enabled: boolean;
  endpoint: string | null;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  keywords: string[];
  excludedKeywords: string[];
};

function envBoolean(value: string | undefined) {
  if (value === undefined) return undefined;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function getAiConfig(): AiConfig {
  const enabled = envBoolean(process.env.AI_ENABLED);
  return {
    enabled: enabled ?? Boolean(aiDefaults.enabled),
    endpoint: process.env.AI_API_URL?.trim() || null,
    apiKey: process.env.AI_API_KEY?.trim() || null,
    model: process.env.AI_MODEL?.trim() || aiDefaults.model,
    timeoutMs: Number.isSafeInteger(Number(process.env.AI_TIMEOUT_MS)) && Number(process.env.AI_TIMEOUT_MS) > 0
      ? Number(process.env.AI_TIMEOUT_MS)
      : aiDefaults.timeoutMs,
    keywords: [...aiDefaults.keywords],
    excludedKeywords: [...aiDefaults.excludedKeywords],
  };
}

export function isAiEnabled() {
  return getAiConfig().enabled;
}

export function aiStatusLabel() {
  return isAiEnabled() ? "AI 已启用（结果须人工确认）" : "AI 已关闭 · 使用规则与人工确认";
}
