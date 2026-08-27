import crypto from "node:crypto";
import { getRawDb } from "@/lib/db/client";
import { formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";
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

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"] as const;

function normalizePublishedAt(value: string | null, now: Date): string {
  const raw = value?.trim() ?? "";
  const isoMatch = /(\d{4})-(\d{2})-(\d{2})(?:T[^\s<]*)?/.exec(raw);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` as DateOnly;
    try {
      parseMelbourneDate(candidate);
      return raw.includes("T") ? raw : candidate;
    } catch {
      // Fall through to the fetch date when a source exposes an invalid date.
    }
  }

  const longDate = /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/.exec(raw);
  if (longDate) {
    const month = MONTHS.indexOf(longDate[2].toLowerCase() as typeof MONTHS[number]) + 1;
    const candidate = `${longDate[3]}-${String(month).padStart(2, "0")}-${String(Number(longDate[1])).padStart(2, "0")}` as DateOnly;
    try {
      parseMelbourneDate(candidate);
      return candidate;
    } catch {
      // Fall through to the fetch date when a source exposes an invalid date.
    }
  }
  return formatDateOnly(now);
}

function resolveUrl(source: NewsSource, value: string): string {
  try {
    return new URL(value, source.url).toString();
  } catch {
    return value;
  }
}

function isFresh(lastFetchedAt: string | null, now: Date) {
  if (!lastFetchedAt) return false;
  const timestamp = Date.parse(lastFetchedAt);
  return Number.isFinite(timestamp) && now.getTime() - timestamp < NEWS_CACHE_MAX_AGE_MS;
}

type ParsedNewsItem = {
  title: string;
  url: string;
  publishedAt: string;
  rawText: string;
  contentHash: string;
};

type AtoCoveoResult = {
  title?: unknown;
  printableUri?: unknown;
  clickUri?: unknown;
  excerpt?: unknown;
  summary?: unknown;
  raw?: Record<string, unknown>;
};

type AtoCoveoResponse = {
  results?: unknown;
};

function buildParsedItem(source: NewsSource, title: string, url: string, publishedAt: string | null, rawText: string, now: Date): ParsedNewsItem {
  const normalizedTitle = textFromHtml(title) || source.name;
  const normalizedUrl = resolveUrl(source, url);
  const normalizedPublishedAt = normalizePublishedAt(publishedAt, now);
  const normalizedText = textFromHtml(rawText).slice(0, 20000);
  if (!normalizedText) throw new Error("Source returned no readable text");
  const contentHash = crypto.createHash("sha256").update(JSON.stringify([normalizedTitle, normalizedUrl, normalizedPublishedAt, normalizedText])).digest("hex");
  return { title: normalizedTitle, url: normalizedUrl, publishedAt: normalizedPublishedAt, rawText: normalizedText, contentHash };
}

function parseArticle(source: NewsSource, html: string, now: Date): ParsedNewsItem {
  const title = firstMatch(html, [/<h1[^>]*>([\s\S]*?)<\/h1>/i, /<title[^>]*>([\s\S]*?)<\/title>/i]) ?? source.name;
  const url = firstMatch(html, [/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i]) ?? source.url;
  const publishedAt = firstMatch(html, [
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']dcterms\.modified["'][^>]+content=["'][^"']*?(\d{4}-\d{2}-\d{2})[^"']*["']/i,
    /(?:Last updated|Published)\s*:?\s*([^<\r\n]+)/i,
  ]);
  return buildParsedItem(source, title, url, publishedAt, html, now);
}

function parseAsicListing(source: NewsSource, html: string, now: Date): ParsedNewsItem[] {
  const entries: ParsedNewsItem[] = [];
  const headingPattern = /<h3\b[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h3>/gi;
  const datePattern = /<span[^>]*class=["'][^"']*nh-list-date[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  const dateMatches = [...html.matchAll(datePattern)];
  for (const match of html.matchAll(headingPattern)) {
    const index = match.index ?? 0;
    const url = match[1];
    if (!/news-centre|newsroom/i.test(url)) continue;
    const date = dateMatches.filter((candidate) => (candidate.index ?? 0) < index).at(-1)?.[1]?.trim() ?? null;
    entries.push(buildParsedItem(source, match[2], url, date, html.slice(Math.max(0, index - 300), Math.min(html.length, index + 900)), now));
  }
  return entries;
}

function parseCavListing(source: NewsSource, html: string, now: Date): ParsedNewsItem[] {
  const entries: ParsedNewsItem[] = [];
  const headingPattern = /<h3\b[^>]*class=["'][^"']*heading[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h3>/gi;
  for (const match of html.matchAll(headingPattern)) {
    const url = match[1];
    if (!/\/latest-news\//i.test(url)) continue;
    const index = match.index ?? 0;
    const block = html.slice(index, index + 1800);
    const followingText = textFromHtml(block);
    const date = /\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/.exec(followingText)?.[0] ?? null;
    entries.push(buildParsedItem(source, match[2], url, date, block, now));
  }
  return entries;
}

function parseTreasuryListing(source: NewsSource, html: string, now: Date): ParsedNewsItem[] {
  const entries: ParsedNewsItem[] = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']*\/media-release\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const index = match.index ?? 0;
    const following = html.slice(index, index + 1600);
    const date = firstMatch(following, [/<time\b[^>]*datetime=["']([^"']+)["']/i]);
    entries.push(buildParsedItem(source, match[2], match[1], date, following, now));
  }
  return entries;
}

function epochToPublishedAt(value: unknown): string | null {
  const milliseconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : formatDateOnly(date);
}

function parseAtoListing(source: NewsSource, payload: AtoCoveoResponse, now: Date): ParsedNewsItem[] {
  if (!Array.isArray(payload.results)) return [];
  const entries: ParsedNewsItem[] = [];
  for (const candidate of payload.results) {
    if (!candidate || typeof candidate !== "object") continue;
    const result = candidate as AtoCoveoResult;
    const title = typeof result.title === "string" ? result.title : "";
    const printableUri = typeof result.printableUri === "string" ? result.printableUri : typeof result.clickUri === "string" ? result.clickUri : "";
    if (!title || !printableUri || (!printableUri.startsWith("/") && !/https:\/\/www\.ato\.gov\.au\//i.test(printableUri))) continue;
    const raw = result.raw ?? {};
    const publishedAt = epochToPublishedAt(raw.dateupdated) ?? epochToPublishedAt(raw.date) ?? null;
    const rawText = [result.excerpt, result.summary, raw.description, title]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ");
    entries.push(buildParsedItem(source, title, printableUri, publishedAt, rawText, now));
  }
  return entries;
}

function extractAtoSearchConfiguration(html: string) {
  const organizationId = firstMatch(html, [
    /"organizationId":\{"value":"([^"]+)"\}/i,
  ]);
  const searchToken = firstMatch(html, [
    /"name":"ATOGov SmallBusiness"[\s\S]{0,1200}?"key":\{"value":"([^"]+)"\}/i,
    /"name":"ATOGov WhatsNew"[\s\S]{0,1200}?"key":\{"value":"([^"]+)"\}/i,
  ]);
  if (!organizationId || !searchToken) {
    throw new Error("ATO list search configuration was not found");
  }
  return { organizationId, searchToken };
}

async function fetchAtoListing(source: NewsSource, fetchImpl: FetchImplementation, now: Date): Promise<ParsedNewsItem[]> {
  const pageResponse = await fetchImpl(source.url, { headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!pageResponse.ok) throw new Error(`ATO list HTTP ${pageResponse.status}`);
  const pageHtml = await pageResponse.text();
  const { organizationId, searchToken } = extractAtoSearchConfiguration(pageHtml);
  const apiUrl = `https://${organizationId}.org.coveo.com/rest/search/v2?organizationId=${encodeURIComponent(organizationId)}`;
  const apiResponse = await fetchImpl(apiUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${searchToken}` },
    body: JSON.stringify({
      q: "",
      numberOfResults: 100,
      sortCriteria: "dateupdated descending",
      fieldsToInclude: ["title", "printableuri", "clickuri", "description", "excerpt", "date", "dateupdated"],
    }),
  });
  if (!apiResponse.ok) throw new Error(`ATO list search HTTP ${apiResponse.status}`);
  const payload = await apiResponse.json() as AtoCoveoResponse;
  return parseAtoListing(source, payload, now);
}

function parseNewsItems(source: NewsSource, html: string, now: Date): ParsedNewsItem[] {
  const items = source.fetchType === "html_listing_asic"
    ? parseAsicListing(source, html, now)
    : source.fetchType === "html_listing_cav"
      ? parseCavListing(source, html, now)
      : source.fetchType === "html_listing_treasury"
        ? parseTreasuryListing(source, html, now)
        : [parseArticle(source, html, now)];
  if (!items.length) throw new Error(`Source returned no parseable news items (${source.fetchType})`);
  return items;
}

export async function refreshSource(sourceId: number | string, fetchImpl: FetchImplementation = fetch, now = new Date()): Promise<void> {
  const source = getNewsSource(sourceId);
  if (!source || !source.active || isFresh(source.lastFetchedAt, now)) return;
  try {
    const articles = source.fetchType === "html_listing_ato"
      ? await fetchAtoListing(source, fetchImpl, now)
      : await (async () => {
        const response = await fetchImpl(source.url, { headers: { Accept: "text/html,application/xhtml+xml" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseNewsItems(source, await response.text(), now);
      })();
    if (!articles.length) throw new Error(`Source returned no parseable news items (${source.fetchType})`);
    const db = getRawDb();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO news_items (source_id, title, url, published_at, raw_text, content_hash, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const article of articles) {
      insert.run(source.id, article.title, article.url, article.publishedAt, article.rawText, article.contentHash, now.toISOString());
    }
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
