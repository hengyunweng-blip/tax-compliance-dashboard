import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createDocument } from "@/lib/ingest/documents";
import { confirmInboxItem, copyPreviousTransaction, listInboxItems } from "@/lib/ingest/inbox";
import { createTransaction } from "@/lib/ingest/transactions";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM transactions; DELETE FROM documents;");
});

function accountId(code = "400") {
  return (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' AND code = ?").get(code) as { id: number }).id;
}

test("lists pending documents and review-flagged transactions in one Inbox", async () => {
  await createDocument({ bytes: Buffer.from("pending"), filename: "pending.pdf", mime: "application/pdf", source: "upload" });
  createTransaction({
    entityId: "boyun_co",
    date: "2026-07-01",
    description: "Needs review",
    accountId: accountId(),
    gstCode: "GST_INCOME",
    amountCents: 100,
    reviewFlag: true,
  });

  const items = await listInboxItems();
  expect(items.map((item) => item.kind).sort()).toEqual(["document", "transaction"]);
});

test("confirms a review transaction only after entity, account and GST code are supplied", () => {
  const transaction = createTransaction({
    entityId: "boyun_co",
    date: "2026-07-01",
    description: "Needs review",
    accountId: accountId(),
    gstCode: "GST_INCOME",
    amountCents: 100,
    reviewFlag: true,
  });

  const confirmed = confirmInboxItem({
    transactionId: transaction.id,
    entityId: "boyun_co",
    accountId: accountId("500"),
    gstCode: "GST_EXPENSE",
  });
  expect(confirmed).toMatchObject({ reviewFlag: false, accountId: accountId("500"), gstCode: "GST_EXPENSE" });
});

test("copies a previous transaction into an editable draft without its original id", () => {
  const transaction = createTransaction({
    entityId: "boyun_co",
    date: "2026-07-01",
    description: "Previous",
    accountId: accountId(),
    gstCode: "GST_INCOME",
    amountCents: 100,
  });

  const draft = copyPreviousTransaction(transaction.id);
  expect(draft).toMatchObject({ entityId: "boyun_co", description: "Previous", locked: false, reviewFlag: true });
  expect(draft).not.toHaveProperty("id");
});
