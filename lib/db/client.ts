import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let database: Database.Database | undefined;

function databasePath() {
  const configuredPath = process.env.DATABASE_PATH ?? "./data/app.db";
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

export function getRawDb() {
  if (!database) {
    const filePath = databasePath();
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
