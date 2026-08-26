import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

export type NewsSource = {
  id: number;
  name: string;
  url: string;
  fetchType: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
};

const SOURCE_ALIASES: Record<string, string> = {
  "ato-small-business": "ATO 小企业资讯",
  "asic": "ASIC 公告",
  "consumer-affairs-victoria": "Consumer Affairs Victoria 房产中介",
  "treasury": "Treasury 政策发布",
};

type NewsSourceRow = {
  id: number;
  name: string;
  url: string;
  fetch_type: string;
  active: number;
  last_fetched_at: string | null;
  last_error: string | null;
};

function mapSource(row: NewsSourceRow): NewsSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    fetchType: row.fetch_type,
    active: Boolean(row.active),
    lastFetchedAt: row.last_fetched_at,
    lastError: row.last_error,
  };
}

export function listNewsSources(includeInactive = false): NewsSource[] {
  runMigrations();
  const rows = getRawDb().prepare(`
    SELECT id, name, url, fetch_type, active, last_fetched_at, last_error
    FROM news_sources
    ${includeInactive ? "" : "WHERE active = 1"}
    ORDER BY id
  `).all() as NewsSourceRow[];
  return rows.map(mapSource);
}

export function getNewsSource(sourceId: number | string): NewsSource | null {
  runMigrations();
  const db = getRawDb();
  if (typeof sourceId === "number") {
    const row = db.prepare("SELECT id, name, url, fetch_type, active, last_fetched_at, last_error FROM news_sources WHERE id = ?").get(sourceId) as NewsSourceRow | undefined;
    return row ? mapSource(row) : null;
  }
  const sourceName = SOURCE_ALIASES[sourceId] ?? sourceId;
  const row = db.prepare("SELECT id, name, url, fetch_type, active, last_fetched_at, last_error FROM news_sources WHERE name = ? OR CAST(id AS TEXT) = ?").get(sourceName, sourceId) as NewsSourceRow | undefined;
  return row ? mapSource(row) : null;
}

export { SOURCE_ALIASES };
