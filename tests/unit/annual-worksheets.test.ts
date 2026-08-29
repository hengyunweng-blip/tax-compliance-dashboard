import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createTransaction } from "@/lib/ingest/transactions";
import {
  buildCompanyTaxWorksheet,
  buildPersonalTaxSummary,
  buildTrustDistributionDraft,
} from "@/lib/domain/annual";
import { mapTransactionToBas } from "@/lib/domain/bas/gst-mapping";

beforeEach(() => {
  seedDatabase();
  const db = getRawDb();
  db.exec("DELETE FROM transactions; DELETE FROM super_contributions; DELETE FROM reminders; DELETE FROM obligations;");
});

function accountId(entityId: string, code: string) {
  return (getRawDb().prepare("SELECT id FROM accounts WHERE entity_id = ? AND code = ?").get(entityId, code) as { id: number }).id;
}

test("company worksheet aggregates by income_year and keeps manual supplements visible", () => {
  const income = createTransaction({
    entityId: "boyun_co",
    date: "2026-07-01",
    description: "Commission",
    accountId: accountId("boyun_co", "400"),
    gstCode: "GST_INCOME",
    amountCents: 110_000,
    gstCents: 10_000,
  });
  createTransaction({
    entityId: "boyun_co",
    date: "2026-07-02",
    description: "Operating cost",
    accountId: accountId("boyun_co", "500"),
    gstCode: "GST_EXPENSE",
    amountCents: -22_000,
    gstCents: -2_000,
  });

  const worksheet = buildCompanyTaxWorksheet("boyun_co", "FY2026-27");
  expect(worksheet.incomeYear).toBe("FY2026-27");
  expect(worksheet.netProfitCents).toBe(80_000);
  expect(worksheet.transactionIds).toEqual([income.id, expect.any(Number)]);
  expect(worksheet.manualItems).toEqual([
    "折旧",
    "结转亏损",
    "franking account 余额",
    "Div 7A 借款余额",
  ]);
});

test("keeps BAS G1 GST-inclusive while annual income is GST-exclusive", () => {
  const transaction = createTransaction({
    entityId: "boyun_co",
    date: "2026-07-01",
    description: "GST-inclusive annual basis fixture",
    accountId: accountId("boyun_co", "400"),
    gstCode: "GST_INCOME",
    amountCents: 110_000,
    gstCents: 10_000,
  });

  expect(mapTransactionToBas(transaction)).toMatchObject({ g1Cents: 110_000 });
  expect(buildCompanyTaxWorksheet("boyun_co", "FY2026-27").incomeCents).toBe(100_000);
});

test("annual expenses and capital purchases exclude GST and omit PRIVATE transactions", () => {
  const operating = createTransaction({
    entityId: "boyun_co",
    date: "2026-07-01",
    description: "GST operating expense",
    accountId: accountId("boyun_co", "500"),
    gstCode: "GST_EXPENSE",
    amountCents: -22_000,
    gstCents: -2_000,
  });
  const capital = createTransaction({
    entityId: "boyun_co",
    date: "2026-07-02",
    description: "GST capital purchase",
    accountId: accountId("boyun_co", "510"),
    gstCode: "GST_CAPITAL",
    amountCents: -110_000,
    gstCents: -10_000,
  });
  const privateTransaction = createTransaction({
    entityId: "boyun_co",
    date: "2026-07-03",
    description: "Private transaction excluded from annual worksheet",
    accountId: accountId("boyun_co", "500"),
    gstCode: "PRIVATE",
    amountCents: -99_000,
    gstCents: 0,
  });

  const worksheet = buildCompanyTaxWorksheet("boyun_co", "FY2026-27");
  expect(worksheet.operatingExpenseCents).toBe(-20_000);
  expect(worksheet.capitalPurchaseCents).toBe(100_000);
  expect(worksheet.transactionIds).toEqual(expect.arrayContaining([operating.id, capital.id]));
  expect(worksheet.transactionIds).not.toContain(privateTransaction.id);
});

test("trust draft is a separate editable decision template for the same income year", () => {
  const draft = buildTrustDistributionDraft("boyun_trust", "FY2025-26");
  expect(draft.incomeYear).toBe("FY2025-26");
  expect(draft.resolutionText).toContain("FY2025–26");
  expect(draft.beneficiaryAllocations).toEqual([]);
  expect(draft.manualItems).toEqual([
    "折旧",
    "结转亏损",
    "信托 FTE 状态",
  ]);
});

test("annual aggregation uses the transaction income year, not the deadline financial year", () => {
  const priorYearTransaction = createTransaction({
    entityId: "boyun_co",
    date: "2026-06-30",
    description: "Prior income-year fixture",
    accountId: accountId("boyun_co", "400"),
    gstCode: "GST_INCOME",
    amountCents: 55_000,
    gstCents: 5_000,
  });

  expect(buildCompanyTaxWorksheet("boyun_co", "FY2025-26").transactionIds).toContain(priorYearTransaction.id);
  expect(buildCompanyTaxWorksheet("boyun_co", "FY2026-27").transactionIds).not.toContain(priorYearTransaction.id);
});

test("personal summary includes contributions without closing the separate notice task", () => {
  getRawDb().prepare(`
    INSERT INTO super_contributions (person, fy, amount_cents, paid_at, notice_submitted_at, cap_cents)
    VALUES ('self', '2026-27', 1_000_000, '2027-06-29', NULL, 3_000_000)
  `).run();

  const summary = buildPersonalTaxSummary("self", "FY2026-27");
  expect(summary.incomeYear).toBe("FY2026-27");
  expect(summary.concessionalContributionsCents).toBe(1_000_000);
  expect(summary.manualItems).toEqual([
    "折旧",
    "结转亏损",
  ]);
  expect(summary.manualItems).not.toContain("franking account 余额");
  expect(summary.manualItems).not.toContain("Div 7A 借款余额");
  expect(summary.manualItems).not.toContain("信托 FTE 状态");
});
