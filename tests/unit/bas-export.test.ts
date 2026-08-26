import { afterEach, beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { exportBasCsv, exportBasPdf } from "@/lib/domain/bas/export";
import { generateBasWorksheet, markBasLodged, updateBasPaygInstalments } from "@/lib/domain/bas/generator";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import { createTransaction } from "@/lib/ingest/transactions";

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

function obligationId(period: "Q1" | "Q2") {
  return (getRawDb().prepare("SELECT id FROM obligations WHERE entity_id = 'boyun_co' AND rule_id = 'bas_quarterly' AND period_label LIKE ?").get(`% ${period}`) as { id: number }).id;
}

function createSale(date: string, description: string) {
  return createTransaction({
    entityId: "boyun_co",
    date,
    description,
    accountId: accountId(),
    gstCode: "GST_INCOME",
    amountCents: 110000,
    gstCents: 10000,
    reviewFlag: false,
    source: "bas-export-test",
  });
}

test("CSV and PDF exports explicitly mark prior-period corrections", async () => {
  createSale("2026-07-04", "Original Q1 sale");
  const q1 = generateBasWorksheet(obligationId("Q1"));
  updateBasPaygInstalments(obligationId("Q1"), { payg5aCents: 0, payg5bCents: 0 });
  markBasLodged(obligationId("Q1"), "ATO-EXPORT-Q1", 10000);

  const late = createSale("2026-07-05", "Late Q1 sale");
  const q2 = generateBasWorksheet(obligationId("Q2"), { action: "include_current" });
  expect(q2.worksheet.lines).toHaveLength(1);
  expect(q2.worksheet.lines[0]).toMatchObject({
    transactionId: late.id,
    isPriorPeriodCorrection: true,
    originalWorksheetId: q1.worksheet.id,
    originalPeriodLabel: "FY2026-27 Q1",
  });

  const csv = await exportBasCsv(q2.worksheet.id).text();
  expect(csv).toContain("本期含 1 笔前期更正，合计 $1,100.00，原属期间 FY2026–27 Q1");
  expect(csv).toContain("前期更正");
  expect(csv).toContain("FY2026–27 Q1");
  expect(csv).toContain(`worksheet #${q1.worksheet.id}`);

  const pdf = Buffer.from(await (await exportBasPdf(q2.worksheet.id)).arrayBuffer()).toString("ascii").replaceAll("\\(", "(").replaceAll("\\)", ")");
  expect(pdf).toContain("Prior-period corrections: 1 transaction(s), total $1,100.00, originally FY2026-27 Q1");
  expect(pdf).toContain("Prior-period correction");
  expect(pdf).toContain(`worksheet #${q1.worksheet.id}`);
});
