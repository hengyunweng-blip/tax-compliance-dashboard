import { getRawDb } from "@/lib/db/client";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import { assertDateOnly, formatDateOnly, formatMelbourneDateTime, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";
import type { ObligationStatus } from "@/lib/domain/obligations/rules";

const ALLOWED_TRANSITIONS: Record<ObligationStatus, readonly ObligationStatus[]> = {
  blocked: ["todo", "na"],
  todo: ["collecting", "blocked", "na"],
  collecting: ["draft_ready", "todo", "blocked"],
  draft_ready: ["lodged", "collecting"],
  lodged: ["paid", "draft_ready"],
  paid: [],
  na: [],
};

type ObligationRow = {
  id: number;
  status: ObligationStatus;
  updated_at: string;
  rule_id?: string;
};

function normalizePaidDate(value: string | null | undefined): DateOnly {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("实际缴款日期为必填");
  }
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) {
    throw new Error(`实际缴款日期无效: ${value}`);
  }
  return date;
}

function normalizeLodgedDate(value: string | null | undefined): DateOnly {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("实际递交日期为必填");
  }
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) {
    throw new Error(`实际递交日期无效: ${value}`);
  }
  return date;
}

export function transitionObligation({
  obligationId,
  to,
  reason,
  lodgedAt,
  paidAt,
}: {
  obligationId: number;
  to: ObligationStatus;
  reason: string;
  lodgedAt?: string | null;
  paidAt?: string | null;
}) {
  if (!reason.trim()) {
    throw new Error("A reason is required for an obligation state transition");
  }

  const db = getRawDb();
  const transaction = db.transaction(() => {
    const current = db.prepare("SELECT id, status, updated_at FROM obligations WHERE id = ?").get(obligationId) as ObligationRow | undefined;
    if (!current) {
      throw new Error(`Obligation not found: ${obligationId}`);
    }
    if (!ALLOWED_TRANSITIONS[current.status].includes(to)) {
      throw new Error(`Invalid obligation transition: ${current.status} -> ${to}`);
    }

    const normalizedLodgedAt = to === "lodged" ? normalizeLodgedDate(lodgedAt) : null;
    const normalizedPaidAt = to === "paid" ? normalizePaidDate(paidAt) : null;
    if (to === "lodged") {
      db.prepare("UPDATE obligations SET status = ?, lodged_at = ?, updated_at = datetime('now') WHERE id = ?").run(to, normalizedLodgedAt, obligationId);
    } else if (to === "paid") {
      db.prepare("UPDATE obligations SET status = ?, paid_at = ?, updated_at = datetime('now') WHERE id = ?").run(to, normalizedPaidAt, obligationId);
    } else {
      db.prepare("UPDATE obligations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(to, obligationId);
    }
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, from_status, to_status, reason, metadata_json, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "obligation",
      String(obligationId),
      current.status,
      to,
      reason.trim(),
      JSON.stringify({ source: "obligation-state-machine" }),
      formatMelbourneDateTime(new Date()),
    );

    return db.prepare("SELECT * FROM obligations WHERE id = ?").get(obligationId) as ObligationRow;
  });

  const result = transaction();
  if (to === "lodged" && result.rule_id === "company_tax_return") {
    expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
  }
  return result;
}
