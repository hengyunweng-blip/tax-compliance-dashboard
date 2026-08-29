import { afterEach, beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import { generateBasWorksheet, markBasLodged, updateBasPaygInstalments } from "@/lib/domain/bas/generator";
import { createTransaction } from "@/lib/ingest/transactions";
import { transitionObligation } from "@/lib/domain/obligations/state-machine";
import { POST as basPost } from "@/app/api/bas/[obligationId]/route";

beforeEach(() => {
  seedDatabase();
  const db = getRawDb();
  db.exec("DELETE FROM bas_worksheets; DELETE FROM reminders; DELETE FROM obligations; DELETE FROM audit_log; DELETE FROM transactions; DELETE FROM documents;");
  expandObligationsInDatabase({ fy: "2026-27", context: { priorYearReturnOutstanding: false } });
});

afterEach(() => {
  getRawDb().exec("DELETE FROM bas_worksheets; DELETE FROM reminders; DELETE FROM audit_log; DELETE FROM obligations; DELETE FROM transactions; DELETE FROM documents;");
});

function q1ObligationId() {
  return (getRawDb().prepare("SELECT id FROM obligations WHERE entity_id = 'boyun_co' AND rule_id = 'bas_quarterly' AND period_label LIKE '% Q1'").get() as { id: number }).id;
}

function accountId() {
  return (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' ORDER BY id LIMIT 1").get() as { id: number }).id;
}

function createQ1Transaction(reviewFlag: boolean) {
  return createTransaction({
    entityId: "boyun_co",
    date: "2026-07-04",
    description: reviewFlag ? "Pending BAS row" : "Confirmed BAS row",
    accountId: accountId(),
    gstCode: "GST_EXPENSE",
    amountCents: -55000,
    gstCents: -5000,
    reviewFlag,
    source: "bas-generator-test",
  });
}

test("generates a worksheet, snapshots eligible IDs and locks them atomically", () => {
  const transaction = createQ1Transaction(false);
  const result = generateBasWorksheet(q1ObligationId());

  expect(result.worksheet.snapshotJson).toContain(String(transaction.id));
  expect(result.lockedTransactionIds).toEqual([transaction.id]);
  expect(getRawDb().prepare("SELECT locked FROM transactions WHERE id = ?").get(transaction.id)).toEqual({ locked: 1 });
  expect(result.worksheet).toMatchObject({ g11Cents: 55000, b1Cents: 5000, gstNetCents: -5000, statementTotalCents: null });
});

test("rolls back worksheet and locks when validation finds unconfirmed rows", () => {
  const transaction = createQ1Transaction(true);

  expect(() => generateBasWorksheet(q1ObligationId())).toThrow(/待确认/);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM bas_worksheets").get()).toEqual({ count: 0 });
  expect(getRawDb().prepare("SELECT locked FROM transactions WHERE id = ?").get(transaction.id)).toEqual({ locked: 0 });
});

test("keeps PAYG manual, resolves statement total, and compares lodged amount to it", () => {
  const obligationId = q1ObligationId();
  const generated = generateBasWorksheet(obligationId);
  expect(generated.worksheet.statementTotalCents).toBeNull();

  const updated = updateBasPaygInstalments(obligationId, { payg5aCents: 2500, payg5bCents: 0 });
  expect(updated).toMatchObject({ payg5aCents: 2500, payg5bCents: 0, paygInstalmentCents: 2500, gstNetCents: 0, statementTotalCents: 2500, statementType: "payable" });
  expect(() => markBasLodged(obligationId, "ATO-RECEIPT-1", 0, "2027-01-15")).toThrow(/2500/);
  expect(markBasLodged(obligationId, "ATO-RECEIPT-1", 2500, "2027-01-15")).toMatchObject({ id: obligationId, status: "lodged" });
  expect(getRawDb().prepare("SELECT to_status, reason FROM audit_log WHERE target_id = ? ORDER BY id DESC LIMIT 1").get(String(obligationId))).toMatchObject({
    to_status: "lodged",
  });
});

test("creates a zero nil BAS worksheet when no confirmed rows exist", () => {
  const result = generateBasWorksheet(q1ObligationId());

  expect(result.worksheet).toMatchObject({ g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0, isNil: true });
  expect(result.worksheet.snapshotJson).toContain("nil BAS");
});

test("persists the user-entered lodged date instead of the current date", async () => {
  const obligationId = q1ObligationId();
  generateBasWorksheet(obligationId);
  updateBasPaygInstalments(obligationId, { payg5aCents: 0, payg5bCents: 0 });

  const response = await basPost(new Request("http://localhost/api/bas/1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "lodge",
      receiptNumber: "ATO-DATE-1",
      lodgedAmountCents: 0,
      lodgedAt: "2027-01-15",
    }),
  }), { params: Promise.resolve({ obligationId: String(obligationId) }) });

  expect(response.status).toBe(200);
  expect(getRawDb().prepare("SELECT lodged_at FROM obligations WHERE id = ?").get(obligationId)).toEqual({ lodged_at: "2027-01-15" });
});

test("allows a nil BAS with no PAYG to be lodged and paid", () => {
  const obligationId = q1ObligationId();
  const generated = generateBasWorksheet(obligationId);
  const updated = updateBasPaygInstalments(obligationId, { payg5aCents: 0, payg5bCents: 0 });

  expect(generated.worksheet.isNil).toBe(true);
  expect(updated).toMatchObject({ payg5aCents: 0, payg5bCents: 0, statementTotalCents: 0 });
  expect(markBasLodged(obligationId, "ATO-NIL-1", 0, "2027-01-16")).toMatchObject({ status: "lodged" });
  expect(transitionObligation({ obligationId, to: "paid", reason: "Nil BAS paid", paidAt: "2027-01-17" })).toMatchObject({ status: "paid" });
});
