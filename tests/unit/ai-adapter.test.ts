import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import {
  classifyTransaction,
  explainObligation,
  extractInvoice,
  summarizeNews,
} from "@/lib/ai/adapter";
import { redactSensitiveText } from "@/lib/ai/redact";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM ai_cache;");
  delete process.env.AI_ENABLED;
  delete process.env.AI_API_URL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
});

afterEach(() => {
  getRawDb().exec("DELETE FROM ai_cache;");
  delete process.env.AI_ENABLED;
  delete process.env.AI_API_URL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  vi.unstubAllGlobals();
});

test("redacts TFN, bank account and full street address before sending or caching", () => {
  const input = "TFN 123 456 789, BSB 062000 Account 12345678, 10 Example Street, Melbourne VIC 3000";
  const result = redactSensitiveText(input);

  expect(result).not.toContain("123 456 789");
  expect(result).not.toContain("12345678");
  expect(result).not.toContain("10 Example Street");
  expect(result).toContain("[REDACTED_TFN]");
  expect(result).toContain("[REDACTED_BANK_ACCOUNT]");
  expect(result).toContain("[REDACTED_ADDRESS]");
});

test("AI disabled uses a fallback and writes one persistent cache row", async () => {
  const first = await classifyTransaction({ description: "ATO payment" }, { entityId: "boyun_co" });
  const second = await classifyTransaction({ description: "ATO payment" }, { entityId: "boyun_co" });

  expect(second).toEqual(first);
  expect(first.degradedReason).toBe("ai_disabled");
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM ai_cache").get()).toEqual({ count: 1 });
});

test("enabled provider receives only redacted input and ai_cache keeps no sensitive value", async () => {
  process.env.AI_ENABLED = "true";
  process.env.AI_API_URL = "https://ai.test/v1/classify";
  process.env.AI_API_KEY = "test-key";
  process.env.AI_MODEL = "test-model";
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({
    accountCode: "400",
    gstCode: "GST_INCOME",
    confidence: "high",
    reviewFlag: false,
    reason: "provider test",
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await classifyTransaction({
    description: "Invoice TFN 123 456 789, BSB 062000 Account 12345678",
    address: "10 Example Street, Melbourne VIC 3000",
  }, {
    entityId: "boyun_co",
    taxFileNumber: "123 456 789",
    bankAccount: "12345678",
    address: "10 Example Street, Melbourne VIC 3000",
  });

  expect(result).toMatchObject({ accountCode: "400", gstCode: "GST_INCOME", modelUsed: "test-model" });
  const sent = JSON.stringify(fetchMock.mock.calls[0]?.[1]?.body ?? "");
  expect(sent).not.toContain("123 456 789");
  expect(sent).not.toContain("12345678");
  expect(sent).not.toContain("10 Example Street");
  const cached = getRawDb().prepare("SELECT redacted_input_json FROM ai_cache LIMIT 1").get() as { redacted_input_json: string };
  expect(cached.redacted_input_json).not.toContain("123 456 789");
  expect(cached.redacted_input_json).not.toContain("12345678");
  expect(cached.redacted_input_json).not.toContain("10 Example Street");
});

test("provider failures fall back without changing ledger or obligations", async () => {
  process.env.AI_ENABLED = "true";
  process.env.AI_API_URL = "https://ai.test/v1/classify";
  process.env.AI_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ invalid: true }), { status: 200 })));
  const before = getRawDb().prepare("SELECT (SELECT COUNT(*) FROM transactions) AS transactions, (SELECT COUNT(*) FROM obligations) AS obligations").get();

  const result = await classifyTransaction({ description: "unrecognised row" }, { entityId: "boyun_co" });
  const after = getRawDb().prepare("SELECT (SELECT COUNT(*) FROM transactions) AS transactions, (SELECT COUNT(*) FROM obligations) AS obligations").get();

  expect(result.degradedReason).toBe("ai_provider_error");
  expect(after).toEqual(before);
});

test("all four adapter methods return typed safe fallbacks when AI is disabled", async () => {
  const invoice = await extractInvoice({ filePath: "data/files/example.pdf", ocrText: "invoice" });
  const classification = await classifyTransaction({ description: "unknown" }, { entityId: "boyun_co" });
  const analyses = await summarizeNews([{ id: 1, title: "ATO GST update", rawText: "GST" }], { entityIds: ["boyun_co"] });
  const explanation = await explainObligation(999999);

  expect(invoice).toMatchObject({ totalCents: null, gstCents: null, degradedReason: "ai_disabled" });
  expect(classification).toHaveProperty("gstCode");
  expect(analyses).toHaveLength(1);
  expect(analyses[0]).toMatchObject({ newsItemId: 1, degradedReason: "ai_disabled" });
  expect(explanation).toMatchObject({ degradedReason: "ai_disabled" });
});
