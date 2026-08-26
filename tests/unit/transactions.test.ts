import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createTransaction, listTransactionsEligibleForBas } from "@/lib/ingest/transactions";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM transactions; DELETE FROM documents;");
});

function accountId() {
  return (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' AND code = '400'").get() as { id: number }).id;
}

function transactionInput(overrides: Record<string, unknown> = {}) {
  return {
    entityId: "boyun_co",
    date: "2026-07-01",
    description: "Realestate commission",
    accountId: accountId(),
    gstCode: "GST_INCOME" as const,
    amountCents: 123450,
    gstCents: 11223,
    source: "manual",
    ...overrides,
  };
}

test("rejects a transaction amount that is not a safe integer", () => {
  expect(() => createTransaction(transactionInput({ amountCents: 10.5 }))).toThrow(/integer cents/);
});

test("derives the Melbourne financial year and quarter without floating money", () => {
  const transaction = createTransaction(transactionInput());

  expect(transaction).toMatchObject({
    amountCents: 123450,
    gstCents: 11223,
    fy: "2026-27",
    quarter: "Q1",
    reviewFlag: false,
    locked: false,
  });
});

test("does not include an unconfirmed transaction in a BAS candidate list", () => {
  createTransaction(transactionInput({ reviewFlag: true }));

  expect(listTransactionsEligibleForBas("boyun_co", "2026-27", "Q1")).toEqual([]);
});

test("includes only confirmed and unlocked transactions in a BAS candidate list", () => {
  const transaction = createTransaction(transactionInput());

  expect(listTransactionsEligibleForBas("boyun_co", "2026-27", "Q1")).toContainEqual(transaction);
});
