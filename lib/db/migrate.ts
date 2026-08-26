import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";

export function runMigrations() {
  migrate(getDb(), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}

if (process.argv[1]?.endsWith("lib/db/migrate.ts")) {
  runMigrations();
}
