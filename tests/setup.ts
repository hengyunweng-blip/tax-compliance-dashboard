import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";
import { closeDatabase } from "@/lib/db/client";

process.env.TZ = "Australia/Melbourne";

let testDatabaseDirectory: string | undefined;

// Setup files run once for each test file/worker. Select the database at
// runtime, after collection, so a collected setup file cannot make the last
// path win globally. Each file owns and cleans up its own temporary database.
beforeAll(() => {
  closeDatabase();
  testDatabaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tax-compliance-vitest-"));
  process.env.DATABASE_PATH = path.join(testDatabaseDirectory, "test.db");
});

afterAll(() => {
  closeDatabase();
  if (testDatabaseDirectory) {
    fs.rmSync(testDatabaseDirectory, { recursive: true, force: true });
    testDatabaseDirectory = undefined;
  }
});
