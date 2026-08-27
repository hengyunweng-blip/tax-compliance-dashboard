import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";

let database: Database.Database | undefined;
let drizzleDatabase: BetterSQLite3Database<typeof schema> | undefined;

export function getDatabaseFilePath() {
  const configuredPath = process.env.DATABASE_PATH ?? "./data/app.db";
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

export function getRawDb() {
  if (!database) {
    const filePath = getDatabaseFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    database = new Database(filePath);
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
  }

  return database;
}

export function pingDatabase() {
  return getRawDb().prepare("SELECT 1 AS ok").get() as { ok: number };
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!drizzleDatabase) {
    drizzleDatabase = drizzle(getRawDb(), { schema });
  }

  return drizzleDatabase;
}

/** Close and forget the singleton so a validated backup can replace the file safely. */
export function closeDatabase() {
  if (database) {
    database.close();
  }
  database = undefined;
  drizzleDatabase = undefined;
}
