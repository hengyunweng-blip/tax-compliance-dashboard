import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { canonicalRedactedJson, hashRedactedInput } from "@/lib/ai/redact";

export type AiProduced<T> = {
  output: T;
  modelUsed: string;
};

export type AiCacheResult<T> = {
  value: T;
  modelUsed: string;
  cached: boolean;
  inputSha256: string;
};

type AiCacheRow = {
  input_sha256: string;
  output_json: string;
  model_used: string;
};

export async function getOrCreateAiCache<T>(method: string, input: unknown, producer: () => Promise<AiProduced<T>>): Promise<AiCacheResult<T>> {
  runMigrations();
  const db = getRawDb();
  const redactedInputJson = canonicalRedactedJson(input);
  const inputSha256 = hashRedactedInput(input);
  const existing = db.prepare("SELECT input_sha256, output_json, model_used FROM ai_cache WHERE method = ? AND input_sha256 = ?").get(method, inputSha256) as AiCacheRow | undefined;
  if (existing) {
    return {
      value: JSON.parse(existing.output_json) as T,
      modelUsed: existing.model_used,
      cached: true,
      inputSha256,
    };
  }

  const produced = await producer();
  const outputJson = JSON.stringify(produced.output);
  try {
    db.prepare(`
      INSERT INTO ai_cache (method, input_sha256, redacted_input_json, output_json, model_used)
      VALUES (?, ?, ?, ?, ?)
    `).run(method, inputSha256, redactedInputJson, outputJson, produced.modelUsed);
    return { value: produced.output, modelUsed: produced.modelUsed, cached: false, inputSha256 };
  } catch (error) {
    const concurrent = db.prepare("SELECT input_sha256, output_json, model_used FROM ai_cache WHERE method = ? AND input_sha256 = ?").get(method, inputSha256) as AiCacheRow | undefined;
    if (!concurrent) throw error;
    return {
      value: JSON.parse(concurrent.output_json) as T,
      modelUsed: concurrent.model_used,
      cached: true,
      inputSha256,
    };
  }
}
