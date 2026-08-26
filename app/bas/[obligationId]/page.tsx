import { notFound } from "next/navigation";
import { BasSummary } from "@/components/bas/bas-summary";
import { getBasWorksheetByObligation } from "@/lib/domain/bas/generator";
import { ensureObligationsForFy, getObligationById } from "@/lib/domain/obligations/repository";

export const dynamic = "force-dynamic";

export default async function BasPage({ params }: { params: Promise<{ obligationId: string }> }) {
  ensureObligationsForFy("2026-27");
  const obligationId = Number((await params).obligationId);
  const obligation = getObligationById(obligationId);
  if (!obligation || obligation.ruleId !== "bas_quarterly") notFound();
  return <BasSummary obligation={obligation} initialWorksheet={getBasWorksheetByObligation(obligation.id)} />;
}
