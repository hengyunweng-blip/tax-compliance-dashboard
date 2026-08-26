import { getRawDb } from "@/lib/db/client";
import { formatMelbourneDateTime } from "@/lib/time/melbourne";
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
};

export function transitionObligation({
  obligationId,
  to,
  reason,
}: {
  obligationId: number;
  to: ObligationStatus;
  reason: string;
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

    db.prepare("UPDATE obligations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(to, obligationId);
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

  return transaction();
}
