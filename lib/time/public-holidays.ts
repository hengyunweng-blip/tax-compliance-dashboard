import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { assertDateOnly, formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export const VICTORIA_PUBLIC_HOLIDAY_SOURCE_URL = "https://business.vic.gov.au/business-information/public-holidays";

export type PublicHolidayYear = {
  year: number;
  confirmed: boolean;
  sourceUrl: string;
  retrievedAt: DateOnly;
  holidayCount: number;
};

export type PublicHoliday = {
  id: number;
  year: number;
  date: DateOnly;
  name: string;
  confirmed: boolean;
  sourceUrl: string;
  retrievedAt: DateOnly;
};

function normalizeYear(value: number) {
  if (!Number.isInteger(value) || value < 2000 || value > 2200) throw new Error("假日年份无效");
  return value;
}

function normalizeDate(value: string) {
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) throw new Error(`假日日期无效: ${value}`);
  return date;
}

export function listPublicHolidayYears(): PublicHolidayYear[] {
  runMigrations();
  return getRawDb().prepare(`
    SELECT y.year, y.confirmed, y.source_url, y.retrieved_at, COUNT(h.id) AS holiday_count
    FROM public_holiday_years y
    LEFT JOIN victorian_public_holidays h ON h.year = y.year
    GROUP BY y.year, y.confirmed, y.source_url, y.retrieved_at
    ORDER BY y.year
  `).all().map((row) => {
    const value = row as { year: number; confirmed: number; source_url: string; retrieved_at: DateOnly; holiday_count: number };
    return { year: value.year, confirmed: Boolean(value.confirmed), sourceUrl: value.source_url, retrievedAt: value.retrieved_at, holidayCount: value.holiday_count };
  });
}

export function listPublicHolidays(year?: number): PublicHoliday[] {
  runMigrations();
  const rows = year === undefined
    ? getRawDb().prepare("SELECT id, year, holiday_date, name, confirmed, source_url, retrieved_at FROM victorian_public_holidays ORDER BY year, holiday_date").all()
    : getRawDb().prepare("SELECT id, year, holiday_date, name, confirmed, source_url, retrieved_at FROM victorian_public_holidays WHERE year = ? ORDER BY holiday_date").all(normalizeYear(year));
  return (rows as Array<{ id: number; year: number; holiday_date: DateOnly; name: string; confirmed: number; source_url: string; retrieved_at: DateOnly }>).map((row) => ({
    id: row.id,
    year: row.year,
    date: normalizeDate(row.holiday_date),
    name: row.name,
    confirmed: Boolean(row.confirmed),
    sourceUrl: row.source_url,
    retrievedAt: normalizeDate(row.retrieved_at),
  }));
}

export function isPublicHolidayYearConfigured(year: number): boolean {
  runMigrations();
  const row = getRawDb().prepare("SELECT confirmed FROM public_holiday_years WHERE year = ?").get(normalizeYear(year)) as { confirmed: number } | undefined;
  return Boolean(row?.confirmed);
}

export function getConfiguredPublicHolidayDates(year: number): Set<string> {
  if (!isPublicHolidayYearConfigured(year)) return new Set();
  const rows = getRawDb().prepare("SELECT holiday_date FROM victorian_public_holidays WHERE year = ? AND confirmed = 1").all(normalizeYear(year)) as Array<{ holiday_date: string }>;
  return new Set(rows.map((row) => row.holiday_date));
}

export function configurePublicHolidayYear(input: { year: number; confirmed: boolean; sourceUrl: string; retrievedAt: string }): PublicHolidayYear {
  runMigrations();
  const year = normalizeYear(input.year);
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) throw new Error("假日来源 URL 为必填");
  const retrievedAt = normalizeDate(input.retrievedAt);
  getRawDb().prepare(`
    INSERT INTO public_holiday_years (year, confirmed, source_url, retrieved_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(year) DO UPDATE SET confirmed = excluded.confirmed, source_url = excluded.source_url, retrieved_at = excluded.retrieved_at, updated_at = datetime('now')
  `).run(year, Number(input.confirmed), sourceUrl, retrievedAt);
  getRawDb().prepare(`
    INSERT INTO audit_log (target_type, target_id, reason, metadata_json)
    VALUES ('public_holiday_year', ?, ?, ?)
  `).run(String(year), input.confirmed ? "确认维州公众假日年度配置" : "暂停维州公众假日年度配置", JSON.stringify({ year, confirmed: input.confirmed, sourceUrl, retrievedAt }));
  return listPublicHolidayYears().find((item) => item.year === year) as PublicHolidayYear;
}

export function savePublicHoliday(input: { year: number; date: string; name: string; confirmed: boolean; sourceUrl: string; retrievedAt: string }): PublicHoliday {
  runMigrations();
  const year = normalizeYear(input.year);
  const date = normalizeDate(input.date);
  if (Number(date.slice(0, 4)) !== year) throw new Error("假日日期年份与年度配置不一致");
  const name = input.name.trim();
  const sourceUrl = input.sourceUrl.trim();
  if (!name || !sourceUrl) throw new Error("假日名称和来源 URL 为必填");
  const retrievedAt = normalizeDate(input.retrievedAt);
  getRawDb().prepare(`
    INSERT INTO victorian_public_holidays (year, holiday_date, name, confirmed, source_url, retrieved_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(year, holiday_date) DO UPDATE SET name = excluded.name, confirmed = excluded.confirmed, source_url = excluded.source_url, retrieved_at = excluded.retrieved_at, updated_at = datetime('now')
  `).run(year, date, name, Number(input.confirmed), sourceUrl, retrievedAt);
  return listPublicHolidays(year).find((item) => item.date === date) as PublicHoliday;
}
