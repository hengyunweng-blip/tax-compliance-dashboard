import crypto from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { GST_CODES, type GstCode } from "@/lib/constants/gst";
import { createTransaction, deriveFiscalPeriod, type Transaction } from "@/lib/ingest/transactions";
import { CSV_DATE_FORMATS, DEFAULT_CSV_DATE_FORMAT, parseCsvDate, type CsvDateFormat } from "@/lib/ingest/csv-date";
import { parseMoneyToCents } from "@/lib/money";
import { type DateOnly } from "@/lib/time/melbourne";

export { CSV_DATE_FORMATS, DEFAULT_CSV_DATE_FORMAT, parseCsvDate } from "@/lib/ingest/csv-date";
export type { CsvDateFormat } from "@/lib/ingest/csv-date";

export type CsvMapping = {
  date: string;
  description: string;
  amount: string;
  balance?: string;
  counterparty?: string;
  dateFormat?: CsvDateFormat;
};

export type CsvRow = Record<string, string>;

export type CsvPreview = {
  headers: string[];
  rows: CsvRow[];
  totalRows: number;
};

export type CsvCreatedRow = {
  id?: number;
  date: DateOnly;
  description: string;
  counterparty: string | null;
  amountCents: number;
  balanceCents: number | null;
  rowHash: string;
  reviewFlag: boolean;
  fy: string;
  quarter: string;
  transaction?: Transaction;
};

export type CsvDuplicate = {
  row: CsvRow;
  rowHash: string;
  reason: string;
};

export type CsvInvalid = {
  row: CsvRow;
  reason: string;
};

export type ImportCsvInput = {
  bankId?: string;
  mapping: CsvMapping;
  rows: CsvRow[];
  existing?: Array<{ date: DateOnly; amountCents: number; rowHash?: string }>;
  entityId?: string;
  accountId?: number;
  accountCode?: string;
  gstCode?: GstCode;
  gstCents?: number;
  reviewFlag?: boolean;
};

export type ImportSummary = {
  created: CsvCreatedRow[];
  duplicates: CsvDuplicate[];
  invalid: CsvInvalid[];
  reviewCount: number;
};

export function hashCsvRow(row: CsvRow) {
  const canonical = Object.keys(row).sort().map((key) => [key, row[key]]);
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function normalizeCsvMapping(mapping: CsvMapping): CsvMapping & { dateFormat: CsvDateFormat } {
  const dateFormat = mapping.dateFormat ?? DEFAULT_CSV_DATE_FORMAT;
  if (!CSV_DATE_FORMATS.includes(dateFormat as CsvDateFormat)) {
    throw new Error(`Unsupported CSV date format: ${dateFormat}`);
  }
  return { ...mapping, dateFormat };
}

function parseCsvMoney(value: string) {
  const trimmed = value.trim();
  const parenthesized = trimmed.startsWith("(") && trimmed.endsWith(")");
  const normalized = trimmed.replace(/,/g, "").replace(/^\((.*)\)$/, "-$1");
  const cents = parseMoneyToCents(normalized);
  return parenthesized ? cents : cents;
}

export function parseCsvPreview(input: string | Uint8Array): CsvPreview {
  const records = parseCsv(typeof input === "string" ? input : Buffer.from(input), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: false,
  }) as CsvRow[];
  const headers = records.length ? Object.keys(records[0]) : [];
  return { headers, rows: records, totalRows: records.length };
}

export function saveCsvMappingTemplate({ bankId, mapping }: { bankId: string; mapping: CsvMapping }) {
  runMigrations();
  if (!bankId.trim()) throw new Error("Bank is required");
  if (!mapping.date || !mapping.description || !mapping.amount) throw new Error("Date, description and amount mappings are required");
  const normalizedMapping = normalizeCsvMapping(mapping);
  const db = getRawDb();
  db.prepare(`
    INSERT INTO csv_mapping_templates (bank_id, mapping_json, last_used_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(bank_id) DO UPDATE SET mapping_json = excluded.mapping_json, last_used_at = excluded.last_used_at
  `).run(bankId.trim(), JSON.stringify(normalizedMapping));
  return { bankId: bankId.trim(), mapping: normalizedMapping };
}

export function importCsv(input: ImportCsvInput): ImportSummary {
  if (!input.mapping.date || !input.mapping.description || !input.mapping.amount) {
    throw new Error("Date, description and amount mappings are required");
  }
  const mapping = normalizeCsvMapping(input.mapping);
  const parsedDates = input.rows.map((row) => {
    const dateValue = row[mapping.date];
    if (!dateValue) {
      throw new Error(`Invalid date "${dateValue ?? ""}" for ${mapping.dateFormat}; date format may be incorrect`);
    }
    return parseCsvDate(dateValue, mapping.dateFormat);
  });
  const existing = new Set(
    (input.existing ?? [])
      .filter((row) => row.rowHash)
      .map((row) => `${row.rowHash}|${row.date}|${row.amountCents}`),
  );
  const created: CsvCreatedRow[] = [];
  const duplicates: CsvDuplicate[] = [];
  const invalid: CsvInvalid[] = [];

  for (const [index, row] of input.rows.entries()) {
    const rowHash = hashCsvRow(row);
    try {
      const dateValue = row[mapping.date];
      const description = row[mapping.description]?.trim();
      const amountValue = row[mapping.amount];
      if (!dateValue || !description || amountValue === undefined) {
        throw new Error("Date, description and amount are required");
      }
      const date = parsedDates[index];
      const amountCents = parseCsvMoney(amountValue);
      const duplicateKey = `${rowHash}|${date}|${amountCents}`;
      if (existing.has(duplicateKey)) {
        duplicates.push({ row, rowHash, reason: "duplicate SHA-256 row hash + date + amount" });
        continue;
      }
      existing.add(duplicateKey);
      const balanceValue = mapping.balance ? row[mapping.balance] : undefined;
      const balanceCents = balanceValue?.trim() ? parseCsvMoney(balanceValue) : null;
      const counterparty = mapping.counterparty ? row[mapping.counterparty]?.trim() || null : null;
      const reviewFlag = input.reviewFlag ?? true;
      const period = deriveFiscalPeriod(date);
      const candidate: CsvCreatedRow = { date, description, counterparty, amountCents, balanceCents, rowHash, reviewFlag, ...period };
      if (input.entityId && (input.accountId !== undefined || input.accountCode) && input.gstCode) {
        const transaction = createTransaction({
          entityId: input.entityId,
          date,
          description,
          counterparty,
          amountCents,
          gstCents: input.gstCents ?? 0,
          accountId: input.accountId,
          accountCode: input.accountCode,
          gstCode: input.gstCode,
          source: "csv",
          reviewFlag,
          notes: JSON.stringify({ bankId: input.bankId ?? null, rowHash }),
        });
        candidate.id = transaction.id;
        candidate.transaction = transaction;
      }
      created.push(candidate);
    } catch (error) {
      invalid.push({ row, reason: error instanceof Error ? error.message : "Invalid CSV row" });
    }
  }

  return { created, duplicates, invalid, reviewCount: created.filter((row) => row.reviewFlag).length };
}
