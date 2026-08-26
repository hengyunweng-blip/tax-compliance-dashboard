import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { importCsv, parseCsvPreview, saveCsvMappingTemplate } from "@/lib/ingest/csv";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM transactions; DELETE FROM documents; DELETE FROM csv_mapping_templates;");
});

test("maps a bank row to date, description and integer cents", () => {
  const result = importCsv({
    bankId: "bank-a",
    mapping: { date: "Date", description: "Narration", amount: "Amount", dateFormat: "DD/MM/YYYY" },
    rows: [{ Date: "01/07/2026", Narration: "Commission", Amount: "1234.50" }],
  });

  expect(result.created[0].amountCents).toBe(123450);
  expect(result.created[0].date).toBe("2026-07-01");
});

test("parses an ambiguous date according to the selected format and assigns different quarters", () => {
  const mapping = { date: "Date", description: "Narration", amount: "Amount" };
  const row = { Date: "03/04/2026", Narration: "Quarter test", Amount: "10.00" };

  const dayFirst = importCsv({ mapping: { ...mapping, dateFormat: "DD/MM/YYYY" }, rows: [row] });
  const monthFirst = importCsv({ mapping: { ...mapping, dateFormat: "MM/DD/YYYY" }, rows: [row] });

  expect(dayFirst.created[0]).toMatchObject({ date: "2026-04-03", quarter: "Q4" });
  expect(monthFirst.created[0]).toMatchObject({ date: "2026-03-04", quarter: "Q3" });
});

test("blocks an import when the selected format produces an impossible month", () => {
  expect(() => importCsv({
    mapping: { date: "Date", description: "Narration", amount: "Amount", dateFormat: "DD/MM/YYYY" },
    rows: [{ Date: "03/13/2026", Narration: "Wrong format", Amount: "10.00" }],
  })).toThrow(/date format may be incorrect/);
});

test("marks duplicate complete rows without collapsing same-day same-amount different merchants", () => {
  const result = importCsv({
    mapping: { date: "date", description: "description", amount: "amount", dateFormat: "DD/MM/YYYY" },
    rows: [
      { date: "01/07/2026", description: "Merchant A", amount: "1234.50" },
      { date: "01/07/2026", description: "Merchant B", amount: "1234.50" },
      { date: "01/07/2026", description: "Merchant A", amount: "1234.50" },
    ],
  });

  expect(result.created).toHaveLength(2);
  expect(result.duplicates).toHaveLength(1);
  expect(result.duplicates[0].reason).toContain("SHA-256");
});

test("uses the complete row hash when comparing against an existing transaction", () => {
  const result = importCsv({
    existing: [{ date: "2026-07-01", amountCents: 123450, rowHash: "existing-row-hash" }],
    mapping: { date: "date", description: "description", amount: "amount", dateFormat: "DD/MM/YYYY" },
    rows: [{ date: "01/07/2026", description: "Different merchant", amount: "1234.50" }],
  });

  expect(result.created).toHaveLength(1);
  expect(result.duplicates).toHaveLength(0);
});

test("previews headers and typed sample rows without writing", () => {
  const preview = parseCsvPreview("Date,Narration,Amount\n01/07/2026,Commission,1234.50\n");

  expect(preview.headers).toEqual(["Date", "Narration", "Amount"]);
  expect(preview.rows).toEqual([{ Date: "01/07/2026", Narration: "Commission", Amount: "1234.50" }]);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM transactions").get()).toEqual({ count: 0 });
});

test("persists a reusable bank mapping template", () => {
  saveCsvMappingTemplate({ bankId: "bank-a", mapping: { date: "Date", description: "Narration", amount: "Amount", dateFormat: "MM/DD/YYYY" } });

  const row = getRawDb().prepare("SELECT mapping_json FROM csv_mapping_templates WHERE bank_id = 'bank-a'").get() as { mapping_json: string };
  expect(JSON.parse(row.mapping_json)).toEqual({
    date: "Date",
    description: "Narration",
    amount: "Amount",
    dateFormat: "MM/DD/YYYY",
  });
});
