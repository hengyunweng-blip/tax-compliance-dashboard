import crypto from "node:crypto";
import { getRawDb } from "@/lib/db/client";
import { formatDateOnly } from "@/lib/time/melbourne";
import { listNewsSources, getNewsSource, type NewsSource } from "@/lib/news/sources";

const NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textFromHtml(html: string) {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]?.trim()) return decodeEntities(match[1].trim());
  }
  return null;
}

function isFresh(lastFetchedAt: string | null, now: Date) {
  if (!lastFetchedAt) return false;
  const timestamp = Date.parse(lastFetchedAt);
  return Number.isFinite(timestamp) && now.getTime() - timestamp < NEWS_CACHE_MAX_AGE_MS;
}

function parseArticle(source: NewsSource, html: string, now: Date) {
  const title = firstMatch(html, [/<h1[^>]*>([\s\S]*?)<\/h1>/i, /<title[^>]*>([\s\S]*?)<\/title>/i]) ?? source.name;
  const url = firstMatch(html, [/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i]) ?? source.url;
  const publishedAt = firstMatch(html, [/<time[^>]+datetime=["']([^"']+)["']/i, /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i]) ?? formatDateOnly(now);
  const rawText = textFromHtml(html).slice(0, 20000);
  if (!rawText) throw new Error("Source returned no readable text");
  const contentHash = crypto.createHash("sha256").update(JSON.stringify([title, url, publishedAt, rawText])).digest("hex");
  return { title: textFromHtml(title), url, publishedAt, rawText, contentHash };
}

export async function refreshSource(sourceId: number | string, fetchImpl: FetchImplementation = fetch, now = new Date()): Promise<void> {
  const source = getNewsSource(sourceId);
  if (!source || !source.active || isFresh(source.lastFetchedAt, now)) return;
  try {
    const response = await fetchImpl(source.url, { headers: { Accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const article = parseArticle(source, await response.text(), now);
    const db = getRawDb();
    db.prepare(`
      INSERT OR IGNORE INTO news_items (source_id, title, url, published_at, raw_text, content_hash, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(source.id, article.title, article.url, article.publishedAt, article.rawText, article.contentHash, now.toISOString());
    db.prepare("UPDATE news_sources SET last_fetched_at = ?, last_error = NULL WHERE id = ?").run(now.toISOString(), source.id);
  } catch (error) {
    // A source failure is isolated to the source's diagnostic field; cached items remain available.
    getRawDb().prepare("UPDATE news_sources SET last_error = ? WHERE id = ?").run(error instanceof Error ? error.message : "Source refresh failed", source.id);
  }
}

export async function refreshNewsInBackground(fetchImpl: FetchImplementation = fetch, now = new Date()): Promise<void> {
  await Promise.all(listNewsSources().map((source) => refreshSource(source.id, fetchImpl, now)));
}

export function newsCacheMaxAgeMs() {
  return NEWS_CACHE_MAX_AGE_MS;
}
