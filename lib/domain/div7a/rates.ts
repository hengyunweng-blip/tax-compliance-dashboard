import Decimal from "decimal.js";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { assertDateOnly, formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export type Div7aBenchmarkRate = {
  incomeYear: string;
  rateText: string;
  sourceUrl: string;
  retrievedAt: string;
  entryMethod: string;
  notes: string | null;
};

/**
 * Initial rows confirmed against the ATO page on 29 Aug 2026. Future years
 * are intentionally absent until the user verifies and enters them.
 */
export const VERIFIED_DIV7A_BENCHMARK_RATE_SEEDS: Div7aBenchmarkRate[] = [
  {
    incomeYear: "FY2025-26",
    rateText: "8.37%",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
    retrievedAt: "2026-08-29",
    entryMethod: "manual",
    notes: "ATO current and past benchmark interest rates for private companies with an income year ending 30 June.",
  },
  {
    incomeYear: "FY2026-27",
    rateText: "8.77%",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
    retrievedAt: "2026-08-29",
    entryMethod: "manual",
    notes: "ATO current and past benchmark interest rates for private companies with an income year ending 30 June.",
  },
];

function normalizeIncomeYear(value: string) {
  const normalized = value.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid income year: ${value}`);
  return `FY${normalized}`;
}

/** Parse a stored rate with Decimal; the stored text remains the source of truth. */
export function parseBenchmarkRateText(value: string): Decimal {
  const normalized = value.trim();
  if (!normalized) throw new Error("Benchmark rate is required");
  const decimal = new Decimal(normalized.endsWith("%") ? normalized.slice(0, -1).trim() : normalized);
  const fraction = normalized.endsWith("%") ? decimal.div(100) : decimal;
  if (!fraction.isFinite() || fraction.isNegative() || fraction.greaterThanOrEqualTo(1)) {
    throw new Error("Benchmark rate must be between 0 and 100 percent");
  }
  return fraction;
}

function normalizeRetrievedAt(value: string) {
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) {
    throw new Error(`Invalid retrieved date: ${value}`);
  }
  return date;
}

export function assertBenchmarkRateSource(rate: Div7aBenchmarkRate): void {
  if (!rate.sourceUrl.startsWith("https://www.ato.gov.au/")) {
    throw new Error("Div 7A benchmark rate source must be an ATO URL");
  }
  normalizeRetrievedAt(rate.retrievedAt);
  parseBenchmarkRateText(rate.rateText);
}

function mapRow(row: {
  income_year: string;
  rate_text: string;
  source_url: string;
  retrieved_at: string;
  entry_method: string;
  notes: string | null;
}): Div7aBenchmarkRate {
  const rate = {
    incomeYear: normalizeIncomeYear(row.income_year),
    rateText: row.rate_text,
    sourceUrl: row.source_url,
    retrievedAt: row.retrieved_at,
    entryMethod: row.entry_method,
    notes: row.notes,
  };
  assertBenchmarkRateSource(rate);
  return rate;
}

export function listBenchmarkRates(): Div7aBenchmarkRate[] {
  runMigrations();
  const rows = getRawDb().prepare(`
    SELECT income_year, rate_text, source_url, retrieved_at, entry_method, notes
    FROM div7a_benchmark_rates
    ORDER BY income_year
  `).all() as Array<{
    income_year: string;
    rate_text: string;
    source_url: string;
    retrieved_at: string;
    entry_method: string;
    notes: string | null;
  }>;
  return rows.map(mapRow);
}

export function getBenchmarkRateForIncomeYear(incomeYear: string, ensureSchema = true): Div7aBenchmarkRate | null {
  if (ensureSchema) runMigrations();
  const normalized = normalizeIncomeYear(incomeYear);
  const row = getRawDb().prepare(`
    SELECT income_year, rate_text, source_url, retrieved_at, entry_method, notes
    FROM div7a_benchmark_rates
    WHERE income_year = ?
  `).get(normalized) as {
    income_year: string;
    rate_text: string;
    source_url: string;
    retrieved_at: string;
    entry_method: string;
    notes: string | null;
  } | undefined;
  return row ? mapRow(row) : null;
}

export function saveBenchmarkRate(input: {
  incomeYear: string;
  rateText: string;
  sourceUrl: string;
  retrievedAt: string;
  entryMethod?: string;
  notes?: string | null;
}) {
  runMigrations();
  const rate: Div7aBenchmarkRate = {
    incomeYear: normalizeIncomeYear(input.incomeYear),
    rateText: input.rateText.trim(),
    sourceUrl: input.sourceUrl.trim(),
    retrievedAt: input.retrievedAt.trim(),
    entryMethod: input.entryMethod?.trim() || "manual",
    notes: input.notes?.trim() || null,
  };
  assertBenchmarkRateSource(rate);
  const db = getRawDb();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO div7a_benchmark_rates (income_year, rate_text, source_url, retrieved_at, entry_method, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(income_year) DO UPDATE SET
        rate_text = excluded.rate_text,
        source_url = excluded.source_url,
        retrieved_at = excluded.retrieved_at,
        entry_method = excluded.entry_method,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).run(rate.incomeYear, rate.rateText, rate.sourceUrl, rate.retrievedAt, rate.entryMethod, rate.notes);
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, reason, metadata_json)
      VALUES (?, ?, ?, ?)
    `).run(
      "div7a_benchmark_rate",
      rate.incomeYear,
      "人工录入/更新 Div 7A 年度基准利率",
      JSON.stringify({ sourceUrl: rate.sourceUrl, retrievedAt: rate.retrievedAt, entryMethod: rate.entryMethod }),
    );
  });
  transaction();
  return getBenchmarkRateForIncomeYear(rate.incomeYear);
}
