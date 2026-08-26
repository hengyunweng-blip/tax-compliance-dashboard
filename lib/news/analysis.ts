import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { summarizeNews } from "@/lib/ai/adapter";
import type { NewsAnalysis } from "@/lib/ai/types";
import { prescreenNewsItem } from "@/lib/news/prescreen";
import { formatMelbourneDateTime } from "@/lib/time/melbourne";

export type NewsFeedItem = {
  id: number;
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
  title: string;
  url: string;
  publishedAt: string | null;
  rawText: string;
  fetchedAt: string;
  analysisId: number | null;
  dismissedAt: string | null;
  analysis: NewsAnalysis | null;
  todo: { id: number; status: string } | null;
};

type FeedRow = {
  id: number;
  source_id: number;
  source_name: string;
  source_url: string;
  title: string;
  url: string;
  published_at: string | null;
  raw_text: string;
  fetched_at: string;
  analysis_id: number | null;
  summary_json: string | null;
  dismissed_at: string | null;
  todo_id: number | null;
  todo_status: string | null;
};

type NewsRow = {
  id: number;
  source_id: number;
  title: string;
  url: string;
  published_at: string | null;
  raw_text: string;
  fetched_at: string;
};

function readAnalysis(value: string | null): NewsAnalysis | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as NewsAnalysis;
    return Number.isSafeInteger(parsed.newsItemId) && typeof parsed.summary === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function mapFeedRow(row: FeedRow): NewsFeedItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    title: row.title,
    url: row.url,
    publishedAt: row.published_at,
    rawText: row.raw_text,
    fetchedAt: row.fetched_at,
    analysisId: row.analysis_id,
    dismissedAt: row.dismissed_at,
    analysis: readAnalysis(row.summary_json),
    todo: row.todo_id === null ? null : { id: row.todo_id, status: row.todo_status ?? "todo" },
  };
}

function feedRows(includeDismissed: boolean): FeedRow[] {
  const rows = getRawDb().prepare(`
    SELECT n.id, n.source_id, s.name AS source_name, s.url AS source_url,
      n.title, n.url, n.published_at, n.raw_text, n.fetched_at,
      a.id AS analysis_id, a.summary_json, a.dismissed_at,
      t.id AS todo_id, t.status AS todo_status
    FROM news_items n
    INNER JOIN news_sources s ON s.id = n.source_id
    LEFT JOIN news_analyses a ON a.news_item_id = n.id
    LEFT JOIN news_todos t ON t.news_analysis_id = a.id
    ${includeDismissed ? "" : "WHERE a.dismissed_at IS NULL"}
    ORDER BY CASE json_extract(a.summary_json, '$.impactLevel') WHEN 'action' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END,
      COALESCE(n.published_at, n.fetched_at) DESC, n.id DESC
  `).all() as FeedRow[];
  return rows;
}

export async function analyseNewsItems(): Promise<void> {
  runMigrations();
  const rows = getRawDb().prepare(`
    SELECT n.id, n.source_id, n.title, n.url, n.published_at, n.raw_text, n.fetched_at
    FROM news_items n
    LEFT JOIN news_analyses a ON a.news_item_id = n.id
    WHERE a.id IS NULL AND a.dismissed_at IS NULL
    ORDER BY n.id
  `).all() as NewsRow[];
  const relevant = rows.filter((row) => prescreenNewsItem({ title: row.title, rawText: row.raw_text }));
  if (!relevant.length) return;
  const suggestions = await summarizeNews(relevant.map((row) => ({ id: row.id, title: row.title, rawText: row.raw_text })), {});
  const db = getRawDb();
  const write = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO news_analyses (news_item_id, affected_entities, impact_level, summary_json, model_used)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const suggestion of suggestions) {
      insert.run(suggestion.newsItemId, JSON.stringify(suggestion.affectedEntities), suggestion.impactLevel, JSON.stringify(suggestion), suggestion.modelUsed);
    }
  });
  write();
}

export function listNewsFeed(includeDismissed = false): NewsFeedItem[] {
  runMigrations();
  return feedRows(includeDismissed).map(mapFeedRow);
}

async function ensureAnalysisForItem(newsItemId: number) {
  const db = getRawDb();
  const item = db.prepare("SELECT id, title, url, published_at, raw_text, fetched_at FROM news_items WHERE id = ?").get(newsItemId) as NewsRow | undefined;
  if (!item) throw new Error(`News item not found: ${newsItemId}`);
  const existing = db.prepare("SELECT id FROM news_analyses WHERE news_item_id = ? ORDER BY id DESC LIMIT 1").get(newsItemId) as { id: number } | undefined;
  if (existing) return existing.id;
  const relevant = prescreenNewsItem({ title: item.title, rawText: item.raw_text });
  const analysis = relevant
    ? (await summarizeNews([{ id: item.id, title: item.title, rawText: item.raw_text }], {}))[0]
    : {
      newsItemId: item.id,
      affectedEntities: [],
      impactLevel: "none" as const,
      summary: "未命中税务关键词，未调用 AI 分析。",
      recommendations: [],
      modelUsed: "keyword-prescreen",
    };
  const result = db.prepare(`
    INSERT INTO news_analyses (news_item_id, affected_entities, impact_level, summary_json, model_used)
    VALUES (?, ?, ?, ?, ?)
  `).run(analysis.newsItemId, JSON.stringify(analysis.affectedEntities), analysis.impactLevel, JSON.stringify(analysis), analysis.modelUsed);
  return Number(result.lastInsertRowid);
}

export async function dismissNewsItem(newsItemId: number): Promise<void> {
  runMigrations();
  const analysisId = await ensureAnalysisForItem(newsItemId);
  getRawDb().prepare("UPDATE news_analyses SET dismissed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(analysisId);
}

export type NewsTodo = {
  id: number;
  newsAnalysisId: number;
  title: string;
  details: string;
  status: string;
  confirmedAt: string;
};

export async function createTodoFromNewsAnalysis(newsAnalysisId: number, confirmed = false): Promise<NewsTodo> {
  if (!confirmed) throw new Error("创建资讯待办前必须明确确认");
  runMigrations();
  const db = getRawDb();
  const analysis = db.prepare(`
    SELECT a.id, n.title, a.summary_json
    FROM news_analyses a
    INNER JOIN news_items n ON n.id = a.news_item_id
    WHERE a.id = ?
  `).get(newsAnalysisId) as { id: number; title: string; summary_json: string } | undefined;
  if (!analysis) throw new Error(`News analysis not found: ${newsAnalysisId}`);
  const existing = db.prepare("SELECT id, news_analysis_id, title, details, status, confirmed_at FROM news_todos WHERE news_analysis_id = ?").get(newsAnalysisId) as {
    id: number; news_analysis_id: number; title: string; details: string; status: string; confirmed_at: string;
  } | undefined;
  if (existing) return { id: existing.id, newsAnalysisId: existing.news_analysis_id, title: existing.title, details: existing.details, status: existing.status, confirmedAt: existing.confirmed_at };

  const result = db.transaction(() => {
    const details = analysis.summary_json;
    const inserted = db.prepare(`
      INSERT INTO news_todos (news_analysis_id, title, details, status)
      VALUES (?, ?, ?, 'todo')
    `).run(newsAnalysisId, `资讯跟进：${analysis.title}`, details);
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, from_status, to_status, reason, metadata_json, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("news_todo", String(inserted.lastInsertRowid), null, "todo", "用户确认资讯分析后创建待办", JSON.stringify({ newsAnalysisId }), formatMelbourneDateTime(new Date()));
    return db.prepare("SELECT id, news_analysis_id, title, details, status, confirmed_at FROM news_todos WHERE id = ?").get(Number(inserted.lastInsertRowid)) as {
      id: number; news_analysis_id: number; title: string; details: string; status: string; confirmed_at: string;
    };
  })();
  return { id: result.id, newsAnalysisId: result.news_analysis_id, title: result.title, details: result.details, status: result.status, confirmedAt: result.confirmed_at };
}
