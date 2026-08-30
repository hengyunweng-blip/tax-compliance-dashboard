import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createTransaction, getAvailableGstCodesForAccountType } from "@/lib/ingest/transactions";
import { buildCompanyTaxWorksheet, buildAnnualReconciliation } from "@/lib/domain/annual";
import { listInboxItems } from "@/lib/ingest/inbox";
import { mapTransactionToBas, summarizeBas } from "@/lib/domain/bas/gst-mapping";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM reminders; DELETE FROM bas_worksheets; DELETE FROM transactions; DELETE FROM obligations; DELETE FROM audit_log;");
});

test.each([
  ["GST_INCOME", 110000, 10000, { g1Cents: 110000, a1Cents: 10000, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["GST_FREE_INCOME", 110000, 0, { g1Cents: 110000, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["INPUT_TAXED", 90000, 0, { g1Cents: 90000, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["GST_EXPENSE", -55000, -5000, { g1Cents: 0, a1Cents: 0, b1Cents: 5000, g10Cents: 0, g11Cents: 55000 }],
  ["GST_CAPITAL", -220000, -20000, { g1Cents: 0, a1Cents: 0, b1Cents: 20000, g10Cents: 220000, g11Cents: 0 }],
  ["NO_GST", -10000, 0, { g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["NOT_A_SUPPLY", 50000, 0, { g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["PRIVATE", -10000, 0, { g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
] as const)("maps %s without floating amounts", (gstCode, amountCents, gstCents, expected) => {
  expect(mapTransactionToBas({ gstCode, amountCents, gstCents })).toEqual(expected);
});

test("separates GST net from the manually entered PAYG statement total", () => {
  const summary = summarizeBas([
    { id: 1, entityId: "boyun_co", accountId: 1, reviewFlag: false, gstCode: "GST_INCOME", amountCents: 110000, gstCents: 10000 },
    { id: 2, entityId: "boyun_co", accountId: 2, reviewFlag: false, gstCode: "GST_EXPENSE", amountCents: -55000, gstCents: -5000 },
  ], { payg5aCents: 2500, payg5bCents: 0 });

  expect(summary).toMatchObject({
    g1Cents: 110000,
    a1Cents: 10000,
    b1Cents: 5000,
    g10Cents: 0,
    g11Cents: 55000,
    payg5aCents: 2500,
    payg5bCents: 0,
    paygInstalmentCents: 2500,
    gstNetCents: 5000,
    statementTotalCents: 7500,
    statementType: "payable",
  });
});

test("keeps the statement total unresolved until PAYG is manually entered", () => {
  const summary = summarizeBas([], null);

  expect(summary).toMatchObject({
    g1Cents: 0,
    a1Cents: 0,
    b1Cents: 0,
    g10Cents: 0,
    g11Cents: 0,
    payg5aCents: null,
    payg5bCents: null,
    paygInstalmentCents: null,
    gstNetCents: 0,
    statementTotalCents: null,
    statementType: null,
  });
});

test("subtracts PAYG 5B credits and labels a negative statement as a refund", () => {
  const summary = summarizeBas([
    { id: 1, entityId: "boyun_co", accountId: 1, reviewFlag: false, gstCode: "GST_EXPENSE", amountCents: -55000, gstCents: -5000 },
  ], { payg5aCents: 0, payg5bCents: 1000 });

  expect(summary).toMatchObject({
    gstNetCents: -5000,
    payg5aCents: 0,
    payg5bCents: 1000,
    statementTotalCents: -6000,
    statementType: "refund",
  });
});

test("warns and excludes review or incomplete transactions from BAS totals", () => {
  const summary = summarizeBas([
    { id: 1, entityId: "boyun_co", accountId: 1, reviewFlag: true, gstCode: "GST_INCOME", amountCents: 110000, gstCents: 10000 },
    { id: 2, entityId: null, accountId: 1, reviewFlag: false, gstCode: "GST_INCOME", amountCents: 220000, gstCents: 20000 },
    { id: 3, entityId: "boyun_co", accountId: null, reviewFlag: false, gstCode: "GST_INCOME", amountCents: 330000, gstCents: 30000 },
    { id: 4, entityId: "boyun_co", accountId: 1, reviewFlag: false, gstCode: undefined, amountCents: 440000, gstCents: 40000 },
  ]);

  expect(summary.g1Cents).toBe(0);
  expect(summary.warnings).toHaveLength(4);
});

test("rejects fractional money or an unknown GST code", () => {
  expect(() => mapTransactionToBas({ gstCode: "GST_INCOME", amountCents: 10.5, gstCents: 1 })).toThrow(/integer cents/);
  expect(() => mapTransactionToBas({ gstCode: "NOT_A_CODE", amountCents: 100, gstCents: 0 })).toThrow(/GST code/);
});

test("income account options separate GST-free sales from amounts that are not a supply", () => {
  const codes = getAvailableGstCodesForAccountType("income");

  expect(codes).toEqual(["GST_INCOME", "GST_FREE_INCOME", "INPUT_TAXED", "NOT_A_SUPPLY"]);
  expect(codes).not.toContain("NO_GST");
});

test("GST-free income appears in both BAS G1 and annual income while NOT_A_SUPPLY appears in neither", () => {
  const accountId = (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' AND code = '400'").get() as { id: number }).id;
  const gstFree = createTransaction({ entityId: "boyun_co", date: "2026-07-01", description: "GST-free sale", accountId, gstCode: "GST_FREE_INCOME", amountCents: 110_000, gstCents: 0 });
  const notSupply = createTransaction({ entityId: "boyun_co", date: "2026-07-02", description: "Shareholder loan receipt", accountId, gstCode: "NOT_A_SUPPLY", amountCents: 500_000, gstCents: 0 });

  expect(mapTransactionToBas(gstFree).g1Cents).toBe(110_000);
  expect(mapTransactionToBas(notSupply).g1Cents).toBe(0);
  const worksheet = buildCompanyTaxWorksheet("boyun_co", "FY2026-27");
  expect(worksheet.incomeCents).toBe(110_000);
  expect(worksheet.transactionIds).toContain(gstFree.id);
  expect(worksheet.transactionIds).not.toContain(notSupply.id);
  expect(buildAnnualReconciliation("boyun_co", "FY2026-27")).toMatchObject({ differenceCents: 0 });
});

test("legacy NO_GST income is not rewritten and is routed to the dedicated review inbox", async () => {
  const accountId = (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' AND code = '400'").get() as { id: number }).id;
  const inserted = getRawDb().prepare(`
    INSERT INTO transactions (entity_id, date, description, amount_cents, gst_cents, account_id, gst_code, source, fy, quarter, review_flag)
    VALUES ('boyun_co', '2026-07-03', 'Legacy non-GST row', 10000, 0, ?, 'NO_GST', 'legacy', '2026-27', 'Q1', 1)
  `).run(accountId);

  const reviewItem = (await listInboxItems()).find((item) => item.kind === "gst_code_review" && item.id === Number(inserted.lastInsertRowid));
  expect(reviewItem).toMatchObject({ kind: "gst_code_review", gstCode: "NO_GST", requiresManualReselection: true });
  if (reviewItem?.kind === "gst_code_review") {
    expect(reviewItem.explanation).toContain("GST-free");
    expect(reviewItem.explanation).toContain("NOT_A_SUPPLY");
  }
  expect((getRawDb().prepare("SELECT gst_code, review_flag FROM transactions WHERE id = ?").get(Number(inserted.lastInsertRowid)) as { gst_code: string; review_flag: number })).toEqual({ gst_code: "NO_GST", review_flag: 1 });
});

test("new income transactions cannot select the retired NO_GST income code", () => {
  const accountId = (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = 'boyun_co' AND code = '400'").get() as { id: number }).id;
  expect(() => createTransaction({ entityId: "boyun_co", date: "2026-07-04", description: "Invalid income code", accountId, gstCode: "NO_GST", amountCents: 100, gstCents: 0 })).toThrow(/NO_GST/);
});
