import { AssetsPageClient } from "@/components/assets/assets-page-client";
import { listAssets, getAssetSchedule } from "@/lib/domain/assets/service";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

export const dynamic = "force-dynamic";

function incomeYearPlus(value: string, years: number) {
  const start = Number(value.slice(2, 6)) + years;
  return `FY${start}-${String(start + 1).slice(-2)}`;
}

export default function AssetsPage() {
  runMigrations();
  const entities = getRawDb().prepare("SELECT id, name FROM entities WHERE active = 1 ORDER BY sort_order").all() as Array<{ id: string; name: string }>;
  const initialAssets = listAssets().map((asset) => ({
    asset,
    schedule: getAssetSchedule(asset.id, "FY2026-27", incomeYearPlus("FY2026-27", 4)),
  }));
  return <AssetsPageClient entities={entities} initialAssets={initialAssets} />;
}

