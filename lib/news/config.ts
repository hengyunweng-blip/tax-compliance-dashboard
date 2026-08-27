import { subDays } from "date-fns";
import { getRawDb } from "@/lib/db/client";
import { formatDateOnly, parseMelbourneDate, todayInMelbourne, type DateOnly } from "@/lib/time/melbourne";

export const NEWS_WINDOW_SETTING_KEY = "news_window_days";
export const DEFAULT_NEWS_WINDOW_DAYS = 90;
export const NEWS_IRRELEVANT_TOPIC_EXCLUSION_SETTING_KEY = "news_exclude_irrelevant_topics";
export const DEFAULT_NEWS_IRRELEVANT_TOPIC_EXCLUSION_ENABLED = true;
const MAX_NEWS_WINDOW_DAYS = 3650;

export function parseNewsWindowDays(value: unknown): number {
  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_NEWS_WINDOW_DAYS) {
    throw new Error(`资讯窗口必须是 1 至 ${MAX_NEWS_WINDOW_DAYS} 天的整数`);
  }
  return days;
}

export function getNewsWindowDays(): number {
  const row = getRawDb().prepare("SELECT value FROM settings WHERE key = ?").get(NEWS_WINDOW_SETTING_KEY) as { value: string } | undefined;
  if (!row) return DEFAULT_NEWS_WINDOW_DAYS;
  try {
    return parseNewsWindowDays(row.value);
  } catch {
    return DEFAULT_NEWS_WINDOW_DAYS;
  }
}

export function setNewsWindowDays(value: unknown): number {
  const days = parseNewsWindowDays(value);
  getRawDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(NEWS_WINDOW_SETTING_KEY, String(days));
  return days;
}

function parseBooleanSetting(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) return false;
  return null;
}

export function getNewsIrrelevantTopicExclusionEnabled(): boolean {
  const row = getRawDb().prepare("SELECT value FROM settings WHERE key = ?").get(NEWS_IRRELEVANT_TOPIC_EXCLUSION_SETTING_KEY) as { value: string } | undefined;
  return parseBooleanSetting(row?.value) ?? DEFAULT_NEWS_IRRELEVANT_TOPIC_EXCLUSION_ENABLED;
}

export function setNewsIrrelevantTopicExclusionEnabled(value: unknown): boolean {
  const enabled = parseBooleanSetting(value);
  if (enabled === null) throw new Error("资讯不适用主题排除开关必须是布尔值");
  getRawDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(NEWS_IRRELEVANT_TOPIC_EXCLUSION_SETTING_KEY, enabled ? "true" : "false");
  return enabled;
}

export function getNewsWindowStart(now = new Date(), days = getNewsWindowDays()): DateOnly {
  const today = todayInMelbourne(now);
  return formatDateOnly(subDays(parseMelbourneDate(today), days));
}
