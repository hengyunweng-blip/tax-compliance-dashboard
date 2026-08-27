import { Div7aPageClient } from "@/components/annual/div7a-page-client";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { getDiv7aLoanSummary, listDiv7aLoans } from "@/lib/domain/div7a/service";

export const dynamic = "force-dynamic";

export default function Div7aPage() {
  runMigrations();
  const entities = getRawDb().prepare("SELECT id, name FROM entities WHERE type = 'company' AND active = 1 ORDER BY sort_order").all() as Array<{ id: string; name: string }>;
  const loans = listDiv7aLoans().map((loan) => getDiv7aLoanSummary(loan.id, "FY2026-27"));
  return <Div7aPageClient entities={entities} initialLoans={loans} />;
}
