import { AnnualPageClient } from "@/components/annual/annual-page-client";
import { buildCompanyTaxWorksheet } from "@/lib/domain/annual/company";
import { buildPersonalTaxSummary } from "@/lib/domain/annual/personal";
import { buildTrustDistributionDraft } from "@/lib/domain/annual/trust";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { currentFinancialYear } from "@/lib/domain/obligations/calculator";

export const dynamic = "force-dynamic";

export default function AnnualPage() {
  runMigrations();
  const entities = getRawDb().prepare("SELECT id, name, type FROM entities WHERE active = 1 ORDER BY sort_order").all() as Array<{ id: string; name: string; type: string }>;
  const initialIncomeYear = currentFinancialYear();
  const initialWorksheets = entities.map((entity) => ({
    entity,
    worksheet: entity.type === "company"
      ? buildCompanyTaxWorksheet(entity.id, initialIncomeYear)
      : entity.type === "trust"
        ? buildTrustDistributionDraft(entity.id, initialIncomeYear)
        : buildPersonalTaxSummary(entity.id, initialIncomeYear),
  }));
  return <AnnualPageClient entities={entities} initialWorksheets={initialWorksheets} initialIncomeYear={initialIncomeYear} />;
}
