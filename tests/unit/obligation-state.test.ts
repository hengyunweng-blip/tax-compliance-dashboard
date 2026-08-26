import { afterEach, beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import { transitionObligation } from "@/lib/domain/obligations/state-machine";

beforeEach(() => {
  seedDatabase();
  const db = getRawDb();
  db.exec("DELETE FROM bas_worksheets; DELETE FROM reminders; DELETE FROM audit_log; DELETE FROM obligations;");
});

afterEach(() => {
  getRawDb().exec("DELETE FROM bas_worksheets; DELETE FROM reminders; DELETE FROM audit_log; DELETE FROM obligations;");
});

test("transitions one obligation and writes one audit row in the same transaction", () => {
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
  const db = getRawDb();
  const obligation = db.prepare("SELECT id, status FROM obligations WHERE status = 'blocked' ORDER BY id LIMIT 1").get() as { id: number; status: string };

  const next = transitionObligation({ obligationId: obligation.id, to: "todo", reason: "Gate 1 unit test" });

  expect(next.status).toBe("todo");
  expect(db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE target_id = ?").get(String(obligation.id))).toEqual({ count: 1 });
  expect(db.prepare("SELECT from_status, to_status, reason FROM audit_log WHERE target_id = ?").get(String(obligation.id))).toMatchObject({
    from_status: obligation.status,
    to_status: "todo",
    reason: "Gate 1 unit test",
  });
});

test("rejects an invalid obligation state transition", () => {
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
  const db = getRawDb();
  const obligation = db.prepare("SELECT id FROM obligations ORDER BY id LIMIT 1").get() as { id: number };

  expect(() => transitionObligation({ obligationId: obligation.id, to: "paid", reason: "skip" })).toThrow(/Invalid obligation transition/);
});

test("does not remind blocked ASIC, but creates all four BAS reminders for the same company", () => {
  const db = getRawDb();
  db.prepare("UPDATE entities SET acn = NULL, asic_review_date = NULL WHERE id = ?").run("yeeliving_co");

  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });

  const basObligations = db.prepare(`
    SELECT o.id, o.effective_due
    FROM obligations o
    WHERE o.entity_id = 'yeeliving_co' AND o.rule_id = 'bas_quarterly'
    ORDER BY o.period_label
  `).all() as Array<{ id: number; effective_due: string }>;
  const asicObligation = db.prepare(`
    SELECT id, status, statutory_due, effective_due
    FROM obligations
    WHERE entity_id = 'yeeliving_co' AND rule_id = 'asic_annual_review'
  `).get() as { id: number; status: string; statutory_due: string | null; effective_due: string | null };

  expect(basObligations).toHaveLength(4);
  expect(asicObligation).toMatchObject({ status: "blocked", statutory_due: null, effective_due: null });
  expect(db.prepare("SELECT COUNT(*) AS count FROM reminders WHERE obligation_id = ?").get(asicObligation.id)).toEqual({ count: 0 });
  expect(db.prepare(`
    SELECT COUNT(*) AS count
    FROM reminders r
    INNER JOIN obligations o ON o.id = r.obligation_id
    WHERE o.entity_id = 'yeeliving_co' AND o.rule_id = 'bas_quarterly'
  `).get()).toEqual({ count: 16 });

  const firstBas = basObligations[0];
  expect(db.prepare(`
    SELECT fire_at, level
    FROM reminders
    WHERE obligation_id = ?
    ORDER BY fire_at
  `).all(firstBas.id)).toEqual([
    { fire_at: "2026-10-12", level: "reminder" },
    { fire_at: "2026-11-01", level: "reminder" },
    { fire_at: "2026-11-08", level: "reminder" },
    { fire_at: "2026-11-11", level: "due" },
  ]);
});
