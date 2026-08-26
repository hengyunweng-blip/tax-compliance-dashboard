import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { GST_CODES, type GstCode } from "@/lib/constants/gst";
import { listTransactions, type ClosedPeriodResolution, type Transaction } from "@/lib/ingest/transactions";

export type DocumentInboxItem = {
  kind: "document";
  id: number;
  entityId: string | null;
  filePath: string;
  mime: string;
  source: string;
  status: string;
};

export type TransactionInboxItem = {
  kind: "transaction";
  id: number;
  entityId: string;
  entityName: string;
  date: string;
  description: string;
  amountCents: number;
  gstCode: GstCode;
  accountId: number;
  reviewFlag: boolean;
};

export type ClosedPeriodInboxItem = Omit<TransactionInboxItem, "kind" | "reviewFlag"> & {
  kind: "closed_period_transaction";
  reviewFlag: boolean;
  originalWorksheetId: number;
  originalPeriodLabel: string;
  closedPeriodResolution: ClosedPeriodResolution | null;
};

export type InboxItem = DocumentInboxItem | TransactionInboxItem | ClosedPeriodInboxItem;

export async function listInboxItems(): Promise<InboxItem[]> {
  runMigrations();
  const db = getRawDb();
  const documents = db.prepare(`
    SELECT id, entity_id, file_path, mime, source, status
    FROM documents
    WHERE status IN ('pending', 'needs_review')
    ORDER BY uploaded_at DESC, id DESC
  `).all() as Array<{
    id: number;
    entity_id: string | null;
    file_path: string;
    mime: string;
    source: string;
    status: string;
  }>;
  const closedPeriodTransactions = db.prepare(`
    SELECT t.id, t.entity_id, e.name AS entity_name, t.date, t.description,
      t.amount_cents, t.gst_code, t.account_id, t.review_flag,
      t.closed_period_worksheet_id, t.closed_period_resolution,
      original.period_label AS original_period_label
    FROM transactions t
    INNER JOIN entities e ON e.id = t.entity_id
    INNER JOIN bas_worksheets original_worksheet ON original_worksheet.id = t.closed_period_worksheet_id
    INNER JOIN obligations original ON original.id = original_worksheet.obligation_id
    WHERE t.belongs_to_closed_period = 1 AND t.locked = 0
    ORDER BY t.date DESC, t.id DESC
  `).all() as Array<{
    id: number;
    entity_id: string;
    entity_name: string;
    date: string;
    description: string;
    amount_cents: number;
    gst_code: GstCode;
    account_id: number;
    review_flag: number;
    closed_period_worksheet_id: number;
    closed_period_resolution: ClosedPeriodResolution | null;
    original_period_label: string;
  }>;
  const transactions = db.prepare(`
    SELECT t.id, t.entity_id, e.name AS entity_name, t.date, t.description,
      t.amount_cents, t.gst_code, t.account_id, t.review_flag
    FROM transactions t
    INNER JOIN entities e ON e.id = t.entity_id
    WHERE t.review_flag = 1 AND t.locked = 0 AND t.belongs_to_closed_period = 0
    ORDER BY t.date DESC, t.id DESC
  `).all() as Array<{
    id: number;
    entity_id: string;
    entity_name: string;
    date: string;
    description: string;
    amount_cents: number;
    gst_code: GstCode;
    account_id: number;
    review_flag: number;
  }>;
  return [
    ...documents.map((document): DocumentInboxItem => ({
      kind: "document",
      id: document.id,
      entityId: document.entity_id,
      filePath: document.file_path,
      mime: document.mime,
      source: document.source,
      status: document.status,
    })),
    ...closedPeriodTransactions.map((transaction): ClosedPeriodInboxItem => ({
      kind: "closed_period_transaction",
      id: transaction.id,
      entityId: transaction.entity_id,
      entityName: transaction.entity_name,
      date: transaction.date,
      description: transaction.description,
      amountCents: transaction.amount_cents,
      gstCode: transaction.gst_code,
      accountId: transaction.account_id,
      reviewFlag: Boolean(transaction.review_flag),
      originalWorksheetId: transaction.closed_period_worksheet_id,
      originalPeriodLabel: transaction.original_period_label,
      closedPeriodResolution: transaction.closed_period_resolution,
    })),
    ...transactions.map((transaction): TransactionInboxItem => ({
      kind: "transaction",
      id: transaction.id,
      entityId: transaction.entity_id,
      entityName: transaction.entity_name,
      date: transaction.date,
      description: transaction.description,
      amountCents: transaction.amount_cents,
      gstCode: transaction.gst_code,
      accountId: transaction.account_id,
      reviewFlag: Boolean(transaction.review_flag),
    })),
  ];
}

function assertGstCode(value: string): asserts value is GstCode {
  if (!GST_CODES.includes(value as GstCode)) throw new Error(`Invalid GST code: ${value}`);
}

export function confirmInboxItem({
  transactionId,
  entityId,
  accountId,
  gstCode,
}: {
  transactionId: number;
  entityId: string;
  accountId: number;
  gstCode: GstCode;
}): Transaction {
  runMigrations();
  if (!entityId || !Number.isSafeInteger(accountId) || accountId <= 0) throw new Error("Entity and account are required");
  assertGstCode(gstCode);
  const db = getRawDb();
  if (!db.prepare("SELECT id FROM entities WHERE id = ? AND active = 1").get(entityId)) throw new Error("Entity not found");
  if (!db.prepare("SELECT id FROM accounts WHERE id = ? AND entity_id = ? AND archived = 0").get(accountId, entityId)) {
    throw new Error("Account does not belong to the selected entity");
  }
  const current = db.prepare("SELECT id, locked FROM transactions WHERE id = ?").get(transactionId) as { id: number; locked: number } | undefined;
  if (!current) throw new Error(`Transaction not found: ${transactionId}`);
  if (current.locked) throw new Error("Locked transactions cannot be edited");
  db.prepare(`
    UPDATE transactions
    SET entity_id = ?, account_id = ?, gst_code = ?, review_flag = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(entityId, accountId, gstCode, transactionId);
  const transaction = listTransactions().find((item) => item.id === transactionId);
  if (!transaction) throw new Error(`Transaction not found: ${transactionId}`);
  return transaction;
}

export function confirmDocument(documentId: number) {
  runMigrations();
  const result = getRawDb().prepare("UPDATE documents SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?").run(documentId);
  if (!result.changes) throw new Error(`Document not found: ${documentId}`);
  return getRawDb().prepare("SELECT id, status FROM documents WHERE id = ?").get(documentId) as { id: number; status: string };
}

export type DraftTransaction = Omit<Transaction, "id">;

export function copyPreviousTransaction(id: number): DraftTransaction {
  runMigrations();
  const transaction = listTransactions().find((item) => item.id === id);
  if (!transaction) throw new Error(`Transaction not found: ${id}`);
  const { id: _id, ...draft } = transaction;
  return {
    ...draft,
    source: "manual",
    documentId: null,
    locked: false,
    reviewFlag: true,
    belongsToClosedPeriod: false,
    closedPeriodWorksheetId: null,
    closedPeriodResolution: null,
    notes: null,
  };
}
