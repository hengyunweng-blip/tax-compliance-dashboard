import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import { closeDatabase } from "@/lib/db/client";

process.env.TZ = "Australia/Melbourne";

const testDatabaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tax-compliance-vitest-"));
process.env.DATABASE_PATH = path.join(testDatabaseDirectory, "test.db");

afterAll(() => {
  closeDatabase();
  fs.rmSync(testDatabaseDirectory, { recursive: true, force: true });
});
