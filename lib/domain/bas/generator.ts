import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { getSimplerBasInstructionSteps } from "@/lib/domain/bas/instructions";
import { mapTransactionToBas, summarizeBas, type BasLineContribution, type BasTransactionInput } from "@/lib/domain/bas/gst-mapping";
import { assertIntegerCents } from "@/lib/money";
import { formatMelbourneDateTime, type DateOnly } from "@/lib/time/melbourne";

type BasTransactionRow = BasTransactionInput & {
  id: number;
  date: DateOnly;
  description: string;
  counterparty: string | null;
  gstCode: string;
};

export type BasLineItem = BasLineContribution & {
  transactionId: number;
  date: DateOnly;
  description: string;
  counterparty: string | null;
  amountCents: number;
  gstCents: number;
  gstCode: string;
};

type BasSnapshot = {
  schemaVersion: 1;
  transactionIds: number[];
  lines: BasLineItem[];
  isNil: boolean;
  label: "nil BAS" | "BAS";
  warnings: string[];
  instructions: string[];
};

export type BasWorksheetRecord = {
  id: number;
  obligationId: number;
  g1Cents: number;
  a1Cents: number;
  b1Cents: number;
  g10Cents: number;
  g11Cents: number;
  paygInstalmentCents: number | null;
  gstNetCents: number;
  netCents: number;
  statementTotalCents: number | null;
  snapshotJson: string;
  generatedAt: string;
  exportPath: string | null;
  lines: BasLineItem[];
  isNil: boolean;
  warnings: string[];
};

export type BasGenerationResult = {
  worksheet: BasWorksheetRecord;
  warnings: string[];
  lockedTransactionIds: number[];
};

export class BasGenerationError extends Error {
  constructor(
    message: string,
    public readonly warnings: string[] = [],
    public readonly pendingTransactionIds: number[] = [],
  ) {
    super(message);
    this.name = "BasGenerationError";
  }
}

type BasWorksheetRow = {
  id: number;
  obligation_id: number;
  g1_cents: number;
  a1_cents: number;
  b1_cents: number;
  g10_cents: number;
  g11_cents: number;
  payg_instalment_cents: number | null;
  net_cents: number;
  statement_total_cents: number | null;
  snapshot_json: string;
  generated_at: string;
  export_path: string | null;
};

function readSnapshot(value: string): BasSnapshot {
  try {
    const parsed = JSON.parse(value) as Partial<BasSnapshot>;
    return {
      schemaVersion: 1,
      transactionIds: Array.isArray(parsed.transactionIds) ? parsed.transactionIds.filter((id): id is number => Number.isSafeInteger(id)) : [],
      lines: Array.isArray(parsed.lines) ? parsed.lines as BasLineItem[] : [],
      isNil: Boolean(parsed.isNil),
      label: parsed.label === "nil BAS" ? "nil BAS" : "BAS",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((warning): warning is string => typeof warning === "string") : [],
      instructions: Array.isArray(parsed.instructions) ? parsed.instructions.filter((instruction): instruction is string => typeof instruction === "string") : getSimplerBasInstructionSteps(),
    };
  } catch {
    return { schemaVersion: 1, transactionIds: [], lines: [], isNil: false, label: "BAS", warnings: ["底稿快照无法读取"], instructions: getSimplerBasInstructionSteps() };
  }
}

function mapWorksheetRow(row: BasWorksheetRow): BasWorksheetRecord {
  const snapshot = readSnapshot(row.snapshot_json);
  return {
    id: row.id,
    obligationId: row.obligation_id,
    g1Cents: row.g1_cents,
    a1Cents: row.a1_cents,
    b1Cents: row.b1_cents,
    g10Cents: row.g10_cents,
    g11Cents: row.g11_cents,
    paygInstalmentCents: row.payg_instalment_cents,
    gstNetCents: row.net_cents,
    netCents: row.net_cents,
    statementTotalCents: row.statement_total_cents,
    snapshotJson: row.snapshot_json,
    generatedAt: row.generated_at,
    exportPath: row.export_path,
    lines: snapshot.lines,
    isNil: snapshot.isNil,
    warnings: snapshot.warnings,
  };
}

function getWorksheetRowByObligation(obligationId: number) {
  return getRawDb().prepare("SELECT * FROM bas_worksheets WHERE obligation_id = ?").get(obligationId) as BasWorksheetRow | undefined;
}

export function getBasWorksheetByObligation(obligationId: number): BasWorksheetRecord | null {
  runMigrations();
  const row = getWorksheetRowByObligation(obligationId);
  return row ? mapWorksheetRow(row) : null;
}

export function getBasWorksheetById(worksheetId: number): BasWorksheetRecord | null {
  runMigrations();
  const row = getRawDb().prepare("SELECT * FROM bas_worksheets WHERE id = ?").get(worksheetId) as BasWorksheetRow | undefined;
  return row ? mapWorksheetRow(row) : null;
}

function periodFromLabel(periodLabel: string) {
  const match = /\b(Q[1-4])$/.exec(periodLabel);
  if (!match) throw new BasGenerationError("BAS 义务缺少季度期间");
  return match[1];
}

function mapTransactionRow(row: BasTransactionRow): BasTransactionInput {
  return {
    id: row.id,
    entityId: row.entityId,
    accountId: row.accountId,
    reviewFlag: row.reviewFlag,
    gstCode: row.gstCode,
    amountCents: row.amountCents,
    gstCents: row.gstCents,
  };
}

function toLineItem(row: BasTransactionRow): BasLineItem {
  return {
    transactionId: row.id,
    date: row.date,
    description: row.description,
    counterparty: row.counterparty,
    amountCents: row.amountCents,
    gstCents: row.gstCents,
    gstCode: row.gstCode,
    ...mapTransactionToBas(row),
  };
}

export function generateBasWorksheet(obligationId: number): BasGenerationResult {
  runMigrations();
  const db = getRawDb();
  const existing = getWorksheetRowByObligation(obligationId);
  if (existing) {
    const worksheet = mapWorksheetRow(existing);
    return { worksheet, warnings: worksheet.warnings, lockedTransactionIds: readSnapshot(worksheet.snapshotJson).transactionIds };
  }

  const generated = db.transaction(() => {
    const obligation = db.prepare(`
      SELECT o.id, o.rule_id, o.entity_id, o.income_year, o.period_label, o.status,
        e.type AS entity_type, e.gst_registered
      FROM obligations o
      INNER JOIN entities e ON e.id = o.entity_id
      WHERE o.id = ?
    `).get(obligationId) as {
      id: number;
      rule_id: string;
      entity_id: string;
      income_year: string;
      period_label: string;
      status: string;
      entity_type: string;
      gst_registered: number;
    } | undefined;
    if (!obligation) throw new BasGenerationError(`BAS 义务不存在: ${obligationId}`);
    if (obligation.rule_id !== "bas_quarterly" || obligation.entity_type !== "company" || !obligation.gst_registered) {
      throw new BasGenerationError("只有已注册 GST 的公司季度 BAS 可以生成底稿");
    }
    if (obligation.status === "blocked") throw new BasGenerationError("BAS 义务尚未就绪");

    const fy = obligation.income_year.replace(/^FY/, "");
    const quarter = periodFromLabel(obligation.period_label);
    const pendingRows = db.prepare(`
      SELECT id
      FROM transactions
      WHERE entity_id = ? AND fy = ? AND quarter = ? AND locked = 0 AND review_flag = 1
      ORDER BY date, id
    `).all(obligation.entity_id, fy, quarter) as Array<{ id: number }>;
    if (pendingRows.length) {
      const warnings = pendingRows.map((row) => `交易 ${row.id} 待确认`);
      throw new BasGenerationError("存在待确认交易，无法生成 BAS", warnings, pendingRows.map((row) => row.id));
    }

    const transactionRows = db.prepare(`
      SELECT id, entity_id AS entityId, date, description, counterparty,
        amount_cents AS amountCents, gst_cents AS gstCents, account_id AS accountId,
        gst_code AS gstCode, review_flag AS reviewFlag
      FROM transactions
      WHERE entity_id = ? AND fy = ? AND quarter = ? AND locked = 0 AND review_flag = 0
      ORDER BY date, id
    `).all(obligation.entity_id, fy, quarter) as BasTransactionRow[];
    const summary = summarizeBas(transactionRows.map(mapTransactionRow), null);
    if (summary.warnings.length) {
      throw new BasGenerationError("存在无法归入 BAS 的交易，底稿未生成", summary.warnings);
    }
    const lines = transactionRows.map(toLineItem);
    const transactionIds = lines.map((line) => line.transactionId);
    const isNil = lines.length === 0;
    const generatedAt = formatMelbourneDateTime(new Date());
    const snapshot: BasSnapshot = {
      schemaVersion: 1,
      transactionIds,
      lines,
      isNil,
      label: isNil ? "nil BAS" : "BAS",
      warnings: [],
      instructions: getSimplerBasInstructionSteps(),
    };

    const inserted = db.prepare(`
      INSERT INTO bas_worksheets (
        obligation_id, g1_cents, a1_cents, b1_cents, g10_cents, g11_cents,
        payg_instalment_cents, net_cents, statement_total_cents, snapshot_json, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
    `).run(
      obligationId,
      summary.g1Cents,
      summary.a1Cents,
      summary.b1Cents,
      summary.g10Cents,
      summary.g11Cents,
      summary.gstNetCents,
      JSON.stringify(snapshot),
      generatedAt,
    );
    const worksheetId = Number(inserted.lastInsertRowid);
    db.prepare("UPDATE obligations SET worksheet_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(worksheetId, "draft_ready", obligationId);
    if (obligation.status !== "draft_ready") {
      db.prepare(`
        INSERT INTO audit_log (target_type, target_id, from_status, to_status, reason, metadata_json, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        "obligation",
        String(obligationId),
        obligation.status,
        "draft_ready",
        "生成 BAS 底稿并锁定纳入交易",
        JSON.stringify({ worksheetId, transactionIds }),
        generatedAt,
      );
    }
    if (transactionIds.length) {
      const placeholders = transactionIds.map(() => "?").join(", ");
      db.prepare(`UPDATE transactions SET locked = 1, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(...transactionIds);
    }
    return {
      row: db.prepare("SELECT * FROM bas_worksheets WHERE id = ?").get(worksheetId) as BasWorksheetRow,
      summary,
      transactionIds,
    };
  })();

  const worksheet = mapWorksheetRow(generated.row);
  return { worksheet, warnings: generated.summary.warnings, lockedTransactionIds: generated.transactionIds };
}

export function updateBasPaygInstalment(obligationId: number, paygInstalmentCents: number | null): BasWorksheetRecord {
  runMigrations();
  if (paygInstalmentCents !== null) assertIntegerCents(paygInstalmentCents);
  const db = getRawDb();
  const worksheet = getWorksheetRowByObligation(obligationId);
  if (!worksheet) throw new BasGenerationError("请先生成 BAS 底稿");
  const statementTotalCents = paygInstalmentCents === null ? null : worksheet.net_cents + paygInstalmentCents;
  db.prepare(`
    UPDATE bas_worksheets
    SET payg_instalment_cents = ?, statement_total_cents = ?, updated_at = datetime('now')
    WHERE obligation_id = ?
  `).run(paygInstalmentCents, statementTotalCents, obligationId);
  const updated = getWorksheetRowByObligation(obligationId);
  if (!updated) throw new BasGenerationError("BAS 底稿不存在");
  return mapWorksheetRow(updated);
}

export function markBasLodged(obligationId: number, receiptNumber: string, lodgedAmountCents: number) {
  runMigrations();
  if (!receiptNumber.trim()) throw new Error("ATO 回执号为必填");
  assertIntegerCents(lodgedAmountCents);
  const db = getRawDb();
  const worksheet = getWorksheetRowByObligation(obligationId);
  if (!worksheet) throw new BasGenerationError("请先生成 BAS 底稿");
  if (worksheet.statement_total_cents === null) throw new BasGenerationError("PAYG 分期预缴额尚未录入，无法校验已递交金额");
  if (lodgedAmountCents !== worksheet.statement_total_cents) {
    throw new Error(`已递交金额必须等于 statementTotalCents ${worksheet.statement_total_cents} 分`);
  }

  const lodgedAt = formatMelbourneDateTime(new Date());
  const result = db.transaction(() => {
    const obligation = db.prepare("SELECT id, status, notes FROM obligations WHERE id = ?").get(obligationId) as { id: number; status: string; notes: string | null } | undefined;
    if (!obligation) throw new Error(`义务不存在: ${obligationId}`);
    if (obligation.status !== "draft_ready") throw new Error(`只有底稿就绪的 BAS 可以标记已递交: ${obligation.status}`);
    let notes: Record<string, unknown> = {};
    try {
      notes = obligation.notes ? JSON.parse(obligation.notes) as Record<string, unknown> : {};
    } catch {
      notes = {};
    }
    notes.lodgement = { receiptNumber: receiptNumber.trim(), lodgedAmountCents };
    db.prepare(`
      UPDATE obligations
      SET status = 'lodged', amount_cents = ?, lodged_at = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(lodgedAmountCents, lodgedAt, JSON.stringify(notes), obligationId);
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, from_status, to_status, reason, metadata_json, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "obligation",
      String(obligationId),
      obligation.status,
      "lodged",
      "记录 ATO BAS 回执",
      JSON.stringify({ receiptNumber: receiptNumber.trim(), lodgedAmountCents, statementTotalCents: worksheet.statement_total_cents }),
      lodgedAt,
    );
    return db.prepare("SELECT id, status, amount_cents AS amountCents, lodged_at AS lodgedAt, notes FROM obligations WHERE id = ?").get(obligationId);
  })();
  return result as { id: number; status: string; amountCents: number; lodgedAt: string; notes: string };
}
