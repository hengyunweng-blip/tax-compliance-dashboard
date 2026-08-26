import { getRawDb } from "@/lib/db/client";
import { ensureObligationsForFy } from "@/lib/domain/obligations/repository";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const obligations = ensureObligationsForFy("2026-27");
  const entities = getRawDb().prepare("SELECT id, name, type FROM entities WHERE active = 1 ORDER BY sort_order").all() as Array<{
    id: string;
    name: string;
    type: string;
  }>;

  return <DashboardClient entities={entities} obligations={obligations} />;
}
