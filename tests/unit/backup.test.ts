import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createBackupArchive, restoreBackupArchive } from "@/lib/backup";

beforeEach(() => {
  seedDatabase();
});

test("backup includes a database and files manifest but excludes environment files", async () => {
  const archive = await createBackupArchive();
  expect(archive.manifest).toMatchObject({ includesDatabase: true, includesFiles: true });
  expect(archive.entries).toContain("app.db");
  expect(archive.entries).toContain("manifest.json");
  expect(archive.entries.some((entry) => entry.includes(".env"))).toBe(false);
}, 30_000);

test("restore round trip reproduces entities, transactions, obligations and worksheets in a temporary database", async () => {
  const db = getRawDb();
  const before = {
    entities: db.prepare("SELECT id, name, type, gst_registered FROM entities ORDER BY sort_order").all(),
    transactions: db.prepare("SELECT id, entity_id, date, amount_cents FROM transactions ORDER BY id").all(),
    obligations: db.prepare("SELECT id, rule_id, entity_id, period_label, status FROM obligations ORDER BY id").all(),
    worksheets: db.prepare("SELECT id, obligation_id, g1_cents, net_cents FROM bas_worksheets ORDER BY id").all(),
  };
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "tax-gate5-restore-"));
  const targetDb = path.join(targetDir, "restored.db");
  const targetFiles = path.join(targetDir, "files");

  const archive = await createBackupArchive();
  await restoreBackupArchive(archive.buffer, { databaseFilePath: targetDb, filesDirectory: targetFiles });
  const restored = new Database(targetDb, { readonly: true });
  expect({
    entities: restored.prepare("SELECT id, name, type, gst_registered FROM entities ORDER BY sort_order").all(),
    transactions: restored.prepare("SELECT id, entity_id, date, amount_cents FROM transactions ORDER BY id").all(),
    obligations: restored.prepare("SELECT id, rule_id, entity_id, period_label, status FROM obligations ORDER BY id").all(),
    worksheets: restored.prepare("SELECT id, obligation_id, g1_cents, net_cents FROM bas_worksheets ORDER BY id").all(),
  }).toEqual(before);
  restored.close();
  fs.rmSync(targetDir, { recursive: true, force: true });
});
