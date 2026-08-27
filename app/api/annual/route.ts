import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { buildCompanyTaxWorksheet } from "@/lib/domain/annual/company";
import { buildPersonalTaxSummary } from "@/lib/domain/annual/personal";
import { buildTrustDistributionDraft } from "@/lib/domain/annual/trust";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    runMigrations();
    const url = new URL(request.url);
    const fy = url.searchParams.get("fy") ?? "2026-27";
    const entityId = url.searchParams.get("entityId");
    const entities = getRawDb().prepare("SELECT id, name, type FROM entities WHERE active = 1 ORDER BY sort_order").all() as Array<{ id: string; name: string; type: string }>;
    const selected = entityId ? entities.filter((entity) => entity.id === entityId) : entities;
    const worksheets = selected.map((entity) => ({
      entity,
      worksheet: entity.type === "company"
        ? buildCompanyTaxWorksheet(entity.id, fy)
        : entity.type === "trust"
          ? buildTrustDistributionDraft(entity.id, fy)
          : buildPersonalTaxSummary(entity.id, fy),
    }));
    return Response.json({ incomeYear: fy.startsWith("FY") ? fy : `FY${fy}`, worksheets });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "年度底稿暂时不可用" }, { status: 400 });
  }
}
