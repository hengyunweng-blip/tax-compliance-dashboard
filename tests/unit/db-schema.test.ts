import { expect, test } from "vitest";
import { amountColumns, tableNames } from "@/lib/db/schema";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

test("schema contains all required business and audit tables", () => {
  expect(tableNames).toEqual(expect.arrayContaining([
    "entities",
    "licences",
    "accounts",
    "transactions",
    "documents",
    "obligation_rules",
    "obligations",
    "reminders",
    "bas_worksheets",
    "div7a_loans",
    "super_contributions",
    "news_sources",
    "news_items",
    "news_analyses",
    "settings",
    "audit_log",
    "ai_cache",
    "csv_mapping_templates",
  ]));
});

test("monetary columns are integer database columns", () => {
  expect(amountColumns.length).toBeGreaterThan(0);
  expect(amountColumns.every((column) => column.dataType === "number")).toBe(true);
  expect(amountColumns.every((column) => column.columnType === "INTEGER")).toBe(true);
});

test("obligations keep income year separate from deadline fiscal year", () => {
  runMigrations();
  const columns = getRawDb()
    .prepare("PRAGMA table_info(obligations)")
    .all() as Array<{ name: string }>;

  expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
    "income_year",
    "deadline_fy",
  ]));
});

test("BAS worksheets keep a nullable integer PAYG instalment field", () => {
  runMigrations();
  const columns = getRawDb()
    .prepare("PRAGMA table_info(bas_worksheets)")
    .all() as Array<{ name: string; type: string; notnull: number }>;
  const paygColumn = columns.find((column) => column.name === "payg_instalment_cents");

  expect(paygColumn).toMatchObject({ type: "INTEGER", notnull: 0 });
});
