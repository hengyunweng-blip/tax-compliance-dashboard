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
    "super_caps",
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

test("obligation rules keep a forward or backward adjustment direction", () => {
  runMigrations();
  const columns = getRawDb()
    .prepare("PRAGMA table_info(obligation_rules)")
    .all() as Array<{ name: string; type: string; notnull: number }>;

  expect(columns.find((column) => column.name === "adjustment_direction")).toMatchObject({
    type: "TEXT",
    notnull: 1,
  });
  expect(columns.find((column) => column.name === "required_fields")).toMatchObject({
    type: "TEXT",
    notnull: 1,
  });
});

test("BAS worksheets keep a nullable integer PAYG instalment field", () => {
  runMigrations();
  const columns = getRawDb()
    .prepare("PRAGMA table_info(bas_worksheets)")
    .all() as Array<{ name: string; type: string; notnull: number }>;
  const paygColumn = columns.find((column) => column.name === "payg_instalment_cents");

  expect(paygColumn).toMatchObject({ type: "INTEGER", notnull: 0 });
});

test("BAS worksheets keep nullable integer PAYG 5A and 5B fields", () => {
  runMigrations();
  const columns = getRawDb()
    .prepare("PRAGMA table_info(bas_worksheets)")
    .all() as Array<{ name: string; type: string; notnull: number }>;

  expect(columns.find((column) => column.name === "payg_5a_cents")).toMatchObject({ type: "INTEGER", notnull: 0 });
  expect(columns.find((column) => column.name === "payg_5b_cents")).toMatchObject({ type: "INTEGER", notnull: 0 });
});

test("super caps are stored by income year with both cap types and provenance", () => {
  runMigrations();
  const columns = getRawDb()
    .prepare("PRAGMA table_info(super_caps)")
    .all() as Array<{ name: string; type: string; notnull: number }>;

  expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
    "income_year",
    "concessional_cap_cents",
    "non_concessional_cap_cents",
    "concessional_source_url",
    "concessional_retrieved_at",
    "non_concessional_source_url",
    "non_concessional_retrieved_at",
  ]));
  expect(columns.find((column) => column.name === "concessional_cap_cents")).toMatchObject({ type: "INTEGER", notnull: 1 });
  expect(columns.find((column) => column.name === "non_concessional_cap_cents")).toMatchObject({ type: "INTEGER", notnull: 1 });
});
