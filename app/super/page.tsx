import { SuperPageClient } from "@/components/annual/super-page-client";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { getSuperProgress } from "@/lib/domain/super/service";
import { currentFinancialYear } from "@/lib/domain/obligations/calculator";

export const dynamic = "force-dynamic";

export default function SuperPage() {
  runMigrations();
  const incomeYear = currentFinancialYear();
  const people = getRawDb().prepare("SELECT id, name FROM entities WHERE type = 'individual' AND active = 1 ORDER BY sort_order").all() as Array<{ id: string; name: string }>;
  const initialProgress = people.map((person) => getSuperProgress(person.id, incomeYear));
  return <SuperPageClient people={people} initialProgress={initialProgress} />;
}
