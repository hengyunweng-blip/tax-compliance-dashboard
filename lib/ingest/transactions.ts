import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { GST_CODES, type GstCode } from "@/lib/constants/gst";
import { assertIntegerCents } from "@/lib/money";
import { assertDateOnly, formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export type ClosedPeriodResolution = "included_current" | "revision_required" | "excluded";

export type Transaction = {
  id: number;
  entityId: string;
  date: DateOnly;
  description: string;
  counterparty: string | null;
  amountCents: number;
  gstCents: number;
  accountId: number;
  gstCode: GstCode;
  source: string;
  documentId: number | null;
  fy: string;
  quarter: string;
  locked: boolean;
  reviewFlag: boolean;
  belongsToClosedPeriod: boolean;
  closedPeriodWorksheetId: number | null;
  closedPeriodResolution: ClosedPeriodResolution | null;
  notes: string | null;
};

export type CreateTransactionInput = {
  entityId: string;
  date: string;
  description: string;
  accountId?: number;
  accountCode?: string;
  gstCode: GstCode;
  amountCents: number;
  gstCents?: number;
  counterparty?: string | null;
  source?: string;
  documentId?: number | null;
  reviewFlag?: boolean;
  notes?: string | null;
};

type TransactionRow = {
  id: number;
  entity_id: string;
  date: DateOnly;
  description: string;
  counterparty: string | null;
  amount_cents: number;
  gst_cents: number;
  account_id: number;
  gst_code: GstCode;
  source: string;
  document_id: number | null;
  fy: string;
  quarter: string;
  locked: number;
  review_flag: number;
  belongs_to_closed_period: number;
  closed_period_worksheet_id: number | null;
  closed_period_resolution: ClosedPeriodResolution | null;
  notes: string | null;
};

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    entityId: row.entity_id,
    date: row.date,
    description: row.description,
    counterparty: row.counterparty,
    amountCents: row.amount_cents,
    gstCents: row.gst_cents,
    accountId: row.account_id,
    gstCode: row.gst_code,
    source: row.source,
    documentId: row.document_id,
    fy: row.fy,
    quarter: row.quarter,
    locked: Boolean(row.locked),
    reviewFlag: Boolean(row.review_flag),
    belongsToClosedPeriod: Boolean(row.belongs_to_closed_period),
    closedPeriodWorksheetId: row.closed_period_worksheet_id,
    closedPeriodResolution: row.closed_period_resolution,
    notes: row.notes,
  };
}

function parseDateOnly(value: string): DateOnly {
  if (typeof value !== "string") {
    throw new Error("Transaction date is required");
  }
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  const parsed = parseMelbourneDate(date);
  if (formatDateOnly(parsed) !== date) {
    throw new Error(`Invalid transaction date: ${value}`);
  }
  return date;
}

export function deriveFiscalPeriod(date: DateOnly) {
  const [yearText, monthText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const fiscalStartYear = month >= 7 ? year : year - 1;
  const fy = `${fiscalStartYear}-${String(fiscalStartYear + 1).slice(-2)}`;
  const quarter = month >= 7 && month <= 9
    ? "Q1"
    : month >= 10
      ? "Q2"
      : month <= 3
        ? "Q3"
        : "Q4";
  return { fy, quarter };
}

function resolveAccountId(input: CreateTransactionInput) {
  if (input.accountId !== undefined) {
    assertIntegerCents(input.accountId);
    if (input.accountId <= 0) throw new Error("Account is required");
    return input.accountId;
  }
  if (!input.accountCode?.trim()) {
    throw new Error("Account is required");
  }
  const account = getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = ? AND code = ? AND archived = 0").get(
    input.entityId,
    input.accountCode.trim(),
  ) as { id: number } | undefined;
  if (!account) throw new Error(`Account not found: ${input.accountCode}`);
  return account.id;
}

function assertGstCode(value: string): asserts value is GstCode {
  if (!GST_CODES.includes(value as GstCode)) {
    throw new Error(`Invalid GST code: ${value}`);
  }
}

export function createTransaction(input: CreateTransactionInput): Transaction {
  runMigrations();
  assertIntegerCents(input.amountCents);
  const gstCents = input.gstCents ?? 0;
  assertIntegerCents(gstCents);
  if (!input.entityId?.trim()) throw new Error("Entity is required");
  const date = parseDateOnly(input.date);
  const description = input.description?.trim();
  if (!description) throw new Error("Description is required");
  assertGstCode(input.gstCode);

  const db = getRawDb();
  const entity = db.prepare("SELECT id FROM entities WHERE id = ? AND active = 1").get(input.entityId);
  if (!entity) throw new Error(`Entity not found: ${input.entityId}`);
  const accountId = resolveAccountId(input);
  const account = db.prepare("SELECT id FROM accounts WHERE id = ? AND entity_id = ? AND archived = 0").get(accountId, input.entityId);
  if (!account) throw new Error("Account does not belong to the selected entity");
  const period = deriveFiscalPeriod(date);

  const insertTransaction = db.transaction(() => {
    const closedPeriod = db.prepare(`
      SELECT w.id AS worksheet_id
      FROM bas_worksheets w
      INNER JOIN obligations o ON o.id = w.obligation_id
      WHERE o.entity_id = ?
        AND o.rule_id = 'bas_quarterly'
        AND o.status IN ('lodged', 'paid')
        AND o.period_start IS NOT NULL
        AND o.period_end IS NOT NULL
        AND o.period_start <= ?
        AND o.period_end >= ?
      ORDER BY o.period_start DESC, w.id DESC
      LIMIT 1
    `).get(input.entityId, date, date) as { worksheet_id: number } | undefined;
    const belongsToClosedPeriod = Boolean(closedPeriod);

    const result = db.prepare(`
      INSERT INTO transactions (
        entity_id, date, description, counterparty, amount_cents, gst_cents,
        account_id, gst_code, source, document_id, fy, quarter, locked, review_flag,
        belongs_to_closed_period, closed_period_worksheet_id, closed_period_resolution, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?)
    `).run(
      input.entityId,
      date,
      description,
      input.counterparty?.trim() || null,
      input.amountCents,
      gstCents,
      accountId,
      input.gstCode,
      input.source?.trim() || "manual",
      input.documentId ?? null,
      period.fy,
      period.quarter,
      Number(input.reviewFlag ?? false),
      Number(belongsToClosedPeriod),
      closedPeriod?.worksheet_id ?? null,
      input.notes?.trim() || null,
    );

    return db.prepare("SELECT * FROM transactions WHERE id = ?").get(Number(result.lastInsertRowid)) as TransactionRow;
  });

  return mapTransaction(insertTransaction());
}

export function listTransactionsEligibleForBas(entityId: string, fy: string, quarter: string): Transaction[] {
  runMigrations();
  const rows = getRawDb().prepare(`
    SELECT *
    FROM transactions
    WHERE entity_id = ? AND fy = ? AND quarter = ? AND locked = 0 AND review_flag = 0
    ORDER BY date, id
  `).all(entityId, fy.replace(/^FY/, ""), quarter) as TransactionRow[];
  return rows.map(mapTransaction);
}

export function listTransactions(filters: { entityId?: string; fy?: string; quarter?: string } = {}): Transaction[] {
  runMigrations();
  const clauses = ["1 = 1"];
  const params: unknown[] = [];
  if (filters.entityId) {
    clauses.push("entity_id = ?");
    params.push(filters.entityId);
  }
  if (filters.fy) {
    clauses.push("fy = ?");
    params.push(filters.fy.replace(/^FY/, ""));
  }
  if (filters.quarter) {
    clauses.push("quarter = ?");
    params.push(filters.quarter);
  }
  const rows = getRawDb().prepare(`
    SELECT * FROM transactions
    WHERE ${clauses.join(" AND ")}
    ORDER BY date DESC, id DESC
  `).all(...params) as TransactionRow[];
  return rows.map(mapTransaction);
}
