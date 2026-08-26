import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { getSimplerBasInstructionSteps } from "@/lib/domain/bas/instructions";
import { mapTransactionToBas, summarizeBas, type BasLineContribution, type BasPaygInput, type BasStatementType, type BasTransactionInput } from "@/lib/domain/bas/gst-mapping";
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
  payg5aCents: number | null;
  payg5bCents: number | null;
  paygInstalmentCents: number | null;
  gstNetCents: number;
  netCents: number;
  statementTotalCents: number | null;
  statementType: BasStatementType;
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

export type ClosedPeriodDecisionAction = "include_current" | "revision_required" | "excluded";

export type ClosedPeriodDecision = {
  action: ClosedPeriodDecisionAction;
  reason?: string;
};

export type ClosedPeriodTransaction = {
  id: number;
  entityId: string;
  date: DateOnly;
  description: string;
  counterparty: string | null;
  amountCents: number;
  gstCents: number;
  accountId: number;
  gstCode: string;
  reviewFlag: boolean;
  originalWorksheetId: number;
  originalPeriodLabel: string;
  closedPeriodResolution: null;
};

export class BasGenerationError extends Error {
  constructor(
    message: string,
    public readonly warnings: string[] = [],
    public readonly pendingTransactionIds: number[] = [],
    public readonly closedPeriodTransactions: ClosedPeriodTransaction[] = [],
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
  payg_5a_cents: number | null;
  payg_5b_cents: number | null;
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
  const payg5aCents = row.payg_5a_cents ?? (row.payg_5b_cents === null ? row.payg_instalment_cents : null);
  const payg5bCents = row.payg_5b_cents ?? (row.payg_5a_cents === null ? (row.payg_instalment_cents === null ? null : 0) : null);
  return {
    id: row.id,
    obligationId: row.obligation_id,
    g1Cents: row.g1_cents,
    a1Cents: row.a1_cents,
    b1Cents: row.b1_cents,
    g10Cents: row.g10_cents,
    g11Cents: row.g11_cents,
    payg5aCents,
    payg5bCents,
    paygInstalmentCents: row.payg_instalment_cents,
    gstNetCents: row.net_cents,
    netCents: row.net_cents,
    statementTotalCents: row.statement_total_cents,
    statementType: row.statement_total_cents === null ? null : row.statement_total_cents < 0 ? "refund" : "payable",
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

function mapClosedPeriodTransaction(row: ClosedPeriodTransaction): ClosedPeriodTransaction {
  return {
    ...row,
    reviewFlag: Boolean(row.reviewFlag),
    closedPeriodResolution: null,
  };
}

function closedPeriodDecisionReason(decision: ClosedPeriodDecision) {
  switch (decision.action) {
    case "include_current":
      return "将已关账期间交易并入本期作为更正";
    case "revision_required":
      return "将已关账期间交易标为待修订";
    case "excluded":
      return `排除已关账期间交易：${decision.reason?.trim() ?? ""}`;
  }
}

export function generateBasWorksheet(obligationId: number, closedPeriodDecision?: ClosedPeriodDecision): BasGenerationResult {
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

    const closedPeriodRows = db.prepare(`
      SELECT t.id, t.entity_id AS entityId, t.date, t.description, t.counterparty,
        t.amount_cents AS amountCents, t.gst_cents AS gstCents, t.account_id AS accountId,
        t.gst_code AS gstCode, t.review_flag AS reviewFlag,
        t.closed_period_worksheet_id AS originalWorksheetId,
        original.period_label AS originalPeriodLabel
      FROM transactions t
      INNER JOIN bas_worksheets original_worksheet ON original_worksheet.id = t.closed_period_worksheet_id
      INNER JOIN obligations original ON original.id = original_worksheet.obligation_id
      WHERE t.entity_id = ?
        AND t.belongs_to_closed_period = 1
        AND t.closed_period_resolution IS NULL
        AND t.locked = 0
      ORDER BY t.date, t.id
    `).all(obligation.entity_id) as ClosedPeriodTransaction[];
    const closedPeriodTransactions = closedPeriodRows.map(mapClosedPeriodTransaction);
    if (closedPeriodTransactions.length) {
      if (!closedPeriodDecision) {
        throw new BasGenerationError(
          `有 ${closedPeriodTransactions.length} 笔属于已关账期间的交易，必须选择处理方式`,
          [],
          [],
          closedPeriodTransactions,
        );
      }
      if (!["include_current", "revision_required", "excluded"].includes(closedPeriodDecision.action)) {
        throw new BasGenerationError("已关账期间交易处理方式无效", [], [], closedPeriodTransactions);
      }
      if (closedPeriodDecision.action === "excluded" && !closedPeriodDecision.reason?.trim()) {
        throw new BasGenerationError("排除已关账期间交易时必须填写原因", [], [], closedPeriodTransactions);
      }
      const pendingClosedPeriodIds = closedPeriodTransactions.filter((row) => row.reviewFlag).map((row) => row.id);
      if (pendingClosedPeriodIds.length) {
        throw new BasGenerationError(
          "存在待确认的已关账期间交易，确认后才能处理",
          pendingClosedPeriodIds.map((id) => `交易 ${id} 待确认`),
          pendingClosedPeriodIds,
          closedPeriodTransactions,
        );
      }
    }

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
    const includedClosedPeriodRows = closedPeriodDecision?.action === "include_current"
      ? closedPeriodRows
      : [];
    const rowsForWorksheet = [...transactionRows, ...includedClosedPeriodRows].sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id);
    const summary = summarizeBas(rowsForWorksheet.map(mapTransactionRow), null);
    if (summary.warnings.length) {
      throw new BasGenerationError("存在无法归入 BAS 的交易，底稿未生成", summary.warnings);
    }
    const lines = rowsForWorksheet.map(toLineItem);
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

    if (closedPeriodTransactions.length && closedPeriodDecision) {
      const resolution = closedPeriodDecision.action === "include_current"
        ? "included_current"
        : closedPeriodDecision.action;
      const resolutionReason = closedPeriodDecisionReason(closedPeriodDecision);
      const updateResolution = db.prepare(`
        UPDATE transactions
        SET closed_period_resolution = ?, updated_at = datetime('now')
        WHERE id = ? AND belongs_to_closed_period = 1 AND closed_period_resolution IS NULL
      `);
      const insertResolutionAudit = db.prepare(`
        INSERT INTO audit_log (target_type, target_id, from_status, to_status, reason, metadata_json, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of closedPeriodTransactions) {
        updateResolution.run(resolution, row.id);
        insertResolutionAudit.run(
          "transaction",
          String(row.id),
          null,
          resolution,
          resolutionReason,
          JSON.stringify({
            originalWorksheetId: row.originalWorksheetId,
            originalPeriodLabel: row.originalPeriodLabel,
            targetObligationId: obligationId,
            decision: closedPeriodDecision.action,
            reason: closedPeriodDecision.reason?.trim() || null,
          }),
          generatedAt,
        );
      }
    }

    const inserted = db.prepare(`
      INSERT INTO bas_worksheets (
        obligation_id, g1_cents, a1_cents, b1_cents, g10_cents, g11_cents,
        payg_5a_cents, payg_5b_cents, payg_instalment_cents, net_cents, statement_total_cents, snapshot_json, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?)
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

export type BasPaygValues = {
  payg5aCents: number | null;
  payg5bCents: number | null;
};

function normalizePaygValues(payg: BasPaygValues): BasPaygInput | null {
  if (payg.payg5aCents === null && payg.payg5bCents === null) return null;
  if (payg.payg5aCents === null || payg.payg5bCents === null) throw new BasGenerationError("PAYG 5A 和 5B 必须同时填写，或同时选择未发生");
  assertIntegerCents(payg.payg5aCents);
  assertIntegerCents(payg.payg5bCents);
  return payg as BasPaygInput;
}

export function updateBasPaygInstalments(obligationId: number, payg: BasPaygValues): BasWorksheetRecord {
  runMigrations();
  const normalizedPayg = normalizePaygValues(payg);
  const db = getRawDb();
  const worksheet = getWorksheetRowByObligation(obligationId);
  if (!worksheet) throw new BasGenerationError("请先生成 BAS 底稿");
  const payg5aCents = normalizedPayg?.payg5aCents ?? null;
  const payg5bCents = normalizedPayg?.payg5bCents ?? null;
  const paygInstalmentCents = normalizedPayg === null ? null : normalizedPayg.payg5aCents - normalizedPayg.payg5bCents;
  const statementTotalCents = normalizedPayg === null ? null : worksheet.net_cents + normalizedPayg.payg5aCents - normalizedPayg.payg5bCents;
  db.prepare(`
    UPDATE bas_worksheets
    SET payg_5a_cents = ?, payg_5b_cents = ?, payg_instalment_cents = ?, statement_total_cents = ?, updated_at = datetime('now')
    WHERE obligation_id = ?
  `).run(payg5aCents, payg5bCents, paygInstalmentCents, statementTotalCents, obligationId);
  const updated = getWorksheetRowByObligation(obligationId);
  if (!updated) throw new BasGenerationError("BAS 底稿不存在");
  return mapWorksheetRow(updated);
}

/** Backward-compatible adapter for callers that only have the former net PAYG value. */
export function updateBasPaygInstalment(obligationId: number, paygInstalmentCents: number | null): BasWorksheetRecord {
  return updateBasPaygInstalments(obligationId, paygInstalmentCents === null
    ? { payg5aCents: null, payg5bCents: null }
    : { payg5aCents: paygInstalmentCents, payg5bCents: 0 });
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
