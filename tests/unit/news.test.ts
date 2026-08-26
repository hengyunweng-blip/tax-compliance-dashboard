import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { analyseNewsItems, createTodoFromNewsAnalysis, dismissNewsItem, listNewsFeed } from "@/lib/news/analysis";
import { refreshSource } from "@/lib/news/fetch";
import { prescreenNewsItem } from "@/lib/news/prescreen";

const articleHtml = `
  <html><head><title>ATO GST activity statement update</title></head>
  <body><time datetime="2026-08-27">27 Aug 2026</time><h1>ATO GST activity statement update</h1>
  <p>Small businesses should review BAS and GST reporting.</p></body></html>
`;

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM news_todos; DELETE FROM news_analyses; DELETE FROM news_items;");
  getRawDb().prepare("UPDATE news_sources SET last_fetched_at = NULL, last_error = NULL").run();
  vi.unstubAllGlobals();
});

afterEach(() => {
  getRawDb().exec("DELETE FROM news_todos; DELETE FROM news_analyses; DELETE FROM news_items;");
  vi.unstubAllGlobals();
});

function sourceId(name: string) {
  return (getRawDb().prepare("SELECT id FROM news_sources WHERE name = ?").get(name) as { id: number }).id;
}

test("only tax-relevant news enters the pre-screen", () => {
  expect(prescreenNewsItem({ title: "ATO GST activity statement update", rawText: "BAS reporting" })).toBe(true);
  expect(prescreenNewsItem({ title: "Unrelated weather alert", rawText: "Heavy rain" })).toBe(false);
});

test("one failed source records last_error while another source still stores an item", async () => {
  const failedSource = sourceId("ASIC 公告");
  const workingSource = sourceId("ATO 小企业资讯");
  await refreshSource(failedSource, async () => { throw new Error("source offline"); });
  await refreshSource(workingSource, async () => new Response(articleHtml, { status: 200 }));

  expect(getRawDb().prepare("SELECT last_error FROM news_sources WHERE id = ?").get(failedSource)).toEqual({ last_error: "source offline" });
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM news_items WHERE source_id = ?").get(workingSource)).toEqual({ count: 1 });
});

test("successful source refresh is cached for 24 hours and content hash deduplicates", async () => {
  const fetchMock = vi.fn(async () => new Response(articleHtml, { status: 200 }));
  const source = sourceId("ATO 小企业资讯");
  await refreshSource(source, fetchMock);
  await refreshSource(source, fetchMock);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM news_items WHERE source_id = ?").get(source)).toEqual({ count: 1 });
});

test("analysis is persisted only for pre-screened items and a todo requires explicit confirmation", async () => {
  const source = sourceId("ATO 小企业资讯");
  const insert = getRawDb().prepare("INSERT INTO news_items (source_id, title, url, published_at, raw_text, content_hash) VALUES (?, ?, ?, ?, ?, ?)");
  insert.run(source, "ATO GST update", "https://example.test/gst", "2026-08-27", "GST BAS update", "hash-relevant");
  insert.run(source, "Weather alert", "https://example.test/weather", "2026-08-27", "Heavy rain", "hash-unrelated");

  await analyseNewsItems();
  const analyses = getRawDb().prepare("SELECT news_item_id FROM news_analyses ORDER BY news_item_id").all() as Array<{ news_item_id: number }>;
  expect(analyses).toHaveLength(1);

  const relevantAnalysisId = (getRawDb().prepare("SELECT id FROM news_analyses LIMIT 1").get() as { id: number }).id;
  await expect(createTodoFromNewsAnalysis(relevantAnalysisId)).rejects.toThrow(/确认/);
  const before = getRawDb().prepare("SELECT COUNT(*) AS count FROM obligations").get();
  const todo = await createTodoFromNewsAnalysis(relevantAnalysisId, true);
  const after = getRawDb().prepare("SELECT COUNT(*) AS count FROM obligations").get();
  expect(todo).toMatchObject({ newsAnalysisId: relevantAnalysisId, status: "todo" });
  expect(after).toEqual(before);
});

test("dismissal is persisted without deleting the original source item", async () => {
  const source = sourceId("ATO 小企业资讯");
  getRawDb().prepare("INSERT INTO news_items (source_id, title, url, published_at, raw_text, content_hash) VALUES (?, ?, ?, ?, ?, ?)").run(source, "ATO GST update", "https://example.test/gst", "2026-08-27", "GST BAS update", "hash-dismiss");
  const itemId = (getRawDb().prepare("SELECT id FROM news_items WHERE content_hash = 'hash-dismiss'").get() as { id: number }).id;
  await analyseNewsItems();
  await dismissNewsItem(itemId);

  expect(getRawDb().prepare("SELECT dismissed_at FROM news_analyses WHERE news_item_id = ?").get(itemId)).toMatchObject({ dismissed_at: expect.any(String) });
  expect((await listNewsFeed(true)).find((item) => item.id === itemId)?.dismissedAt).toEqual(expect.any(String));
});
