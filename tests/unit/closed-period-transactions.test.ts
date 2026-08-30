import { afterEach, beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import {
  generateBasWorksheet,
  markBasLodged,
  updateBasPaygInstalments,
} from "@/lib/domain/bas/generator";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import { createTransaction } from "@/lib/ingest/transactions";
import { listInboxItems } from "@/lib/ingest/inbox";

beforeEach(() => {
  seedDatabase();
  const db = getRawDb();
  db.exec("DELETE FROM bas_worksheets; DELETE FROM reminders; DELETE FROM obligations; DELETE FROM audit_log; DELETE FROM transactions; DELETE FROM documents;");
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
});

afterEach(() => {
  getRawDb().exec("DELETE FROM bas_worksheets; DELETE FROM reminders; DELETE FROM audit_log; DELETE FROM obligations; DELETE FROM transactions; DELETE FROM documents;");
});

function accountId() {
  return (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' AND code = '400'").get() as { id: number }).id;
}

function expenseAccountId() {
  return (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' AND code = '500'").get() as { id: number }).id;
}

function obligationId(period: "Q1" | "Q2") {
  return (getRawDb().prepare("SELECT id FROM obligations WHERE entity_id = 'boyun_co' AND rule_id = 'bas_quarterly' AND period_label LIKE ?").get(`% ${period}`) as { id: number }).id;
}

function createConfirmedTransaction(date: string, description: string, values: { amountCents?: number; gstCents?: number } = {}) {
  return createTransaction({
    entityId: "boyun_co",
    date,
    description,
    accountId: accountId(),
    gstCode: "GST_INCOME",
    amountCents: values.amountCents ?? 110000,
    gstCents: values.gstCents ?? 10000,
    reviewFlag: false,
    source: "closed-period-test",
  });
}

function generateAndLodgeQ1() {
  createConfirmedTransaction("2026-07-04", "Original Q1 sale");
  const generated = generateBasWorksheet(obligationId("Q1"));
  updateBasPaygInstalments(obligationId("Q1"), { payg5aCents: 0, payg5bCents: 0 });
  markBasLodged(obligationId("Q1"), "ATO-CLOSED-Q1", 10000, "2027-01-15");
  return { worksheetId: generated.worksheet.id, q1ObligationId: obligationId("Q1") };
}

function worksheetAmounts(worksheetId: number) {
  return getRawDb().prepare(`
    SELECT g1_cents, a1_cents, b1_cents, g10_cents, g11_cents,
      payg_5a_cents, payg_5b_cents, payg_instalment_cents,
      net_cents, statement_total_cents, snapshot_json
    FROM bas_worksheets
    WHERE id = ?
  `).get(worksheetId);
}

test("marks a Q1 transaction entered after Q1 lodgement without changing the Q1 worksheet", () => {
  const q1 = generateAndLodgeQ1();
  const before = worksheetAmounts(q1.worksheetId);

  const late = createConfirmedTransaction("2026-07-05", "Late Q1 sale");

  expect(late).toMatchObject({
    belongsToClosedPeriod: true,
    closedPeriodWorksheetId: q1.worksheetId,
    closedPeriodResolution: null,
  });
  expect(worksheetAmounts(q1.worksheetId)).toEqual(before);
});

test("lists closed-period transactions in a separate Inbox queue", async () => {
  generateAndLodgeQ1();
  const late = createConfirmedTransaction("2026-07-05", "Late Q1 sale");
  const ordinary = createTransaction({
    entityId: "boyun_co",
    date: "2026-10-05",
    description: "Ordinary Q2 review row",
    accountId: expenseAccountId(),
    gstCode: "GST_EXPENSE",
    amountCents: -5500,
    gstCents: -500,
    reviewFlag: true,
    source: "closed-period-test",
  });

  const items = await listInboxItems();
  const closed = items.find((item) => item.kind === "closed_period_transaction" && item.id === late.id);

  expect(closed).toMatchObject({
    kind: "closed_period_transaction",
    originalWorksheetId: expect.any(Number),
  });
  expect(items.find((item) => item.kind === "transaction" && item.id === late.id)).toBeUndefined();
  expect(items.find((item) => item.kind === "transaction" && item.id === ordinary.id)).toBeDefined();
});

test("requires a choice before generating the next BAS and audits the selected resolution", () => {
  const q1 = generateAndLodgeQ1();
  const before = worksheetAmounts(q1.worksheetId);
  createConfirmedTransaction("2026-07-05", "Late Q1 sale");

  expect(() => generateBasWorksheet(obligationId("Q2"))).toThrow(/属于已关账期间/);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM bas_worksheets").get()).toEqual({ count: 1 });

  const q2 = generateBasWorksheet(obligationId("Q2"), {
    action: "include_current",
  });
  expect(q2.worksheet.lines).toHaveLength(1);
  expect(q2.worksheet.snapshotJson).toContain("Late Q1 sale");
  expect(worksheetAmounts(q1.worksheetId)).toEqual(before);
  expect(getRawDb().prepare("SELECT closed_period_resolution, locked FROM transactions WHERE description = 'Late Q1 sale'").get()).toEqual({
    closed_period_resolution: "included_current",
    locked: 1,
  });
  expect(getRawDb().prepare("SELECT target_type, reason, metadata_json FROM audit_log WHERE target_type = 'transaction' ORDER BY id DESC LIMIT 1").get()).toMatchObject({
    target_type: "transaction",
    reason: "将已关账期间交易并入本期作为更正",
  });
  expect(q2.worksheet.id).not.toBe(q1.worksheetId);
});

test("blocks include_current when a GST correction exceeds the ATO threshold and permits revision", () => {
  const q1 = generateAndLodgeQ1();
  const late = createConfirmedTransaction("2026-07-05", "Over-limit Q1 sale", {
    amountCents: 13_750_000,
    gstCents: 1_250_000,
  });

  expect(() => generateBasWorksheet(obligationId("Q2"), { action: "include_current" })).toThrow(/12,500|修订/);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM bas_worksheets").get()).toEqual({ count: 1 });
  expect(getRawDb().prepare("SELECT locked, closed_period_resolution FROM transactions WHERE id = ?").get(late.id)).toEqual({ locked: 0, closed_period_resolution: null });
  expect(worksheetAmounts(q1.worksheetId)).toMatchObject({
    g1_cents: 110000,
    a1_cents: 10000,
  });

  const revised = generateBasWorksheet(obligationId("Q2"), { action: "revision_required" });
  expect(revised.worksheet.lines).toHaveLength(0);
  expect(getRawDb().prepare("SELECT closed_period_resolution FROM transactions WHERE id = ?").get(late.id)).toEqual({ closed_period_resolution: "revision_required" });
});
