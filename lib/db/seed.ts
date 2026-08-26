import { getDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

export function seedDatabase() {
  runMigrations();
  getDb().run("SELECT 1");
}

if (process.argv[1]?.endsWith("lib/db/seed.ts")) {
  seedDatabase();
}
