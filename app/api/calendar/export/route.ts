import { ensureObligationsForFy } from "@/lib/domain/obligations/repository";
import { serializeObligationsToIcs } from "@/lib/domain/obligations/ics";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const fy = new URL(request.url).searchParams.get("fy") ?? "2026-27";
  const obligations = ensureObligationsForFy(fy);
  const ics = serializeObligationsToIcs(obligations.map((obligation) => ({
    id: obligation.id,
    entityName: obligation.entityName,
    periodLabel: obligation.periodLabel,
    ruleLabel: obligation.ruleLabel,
    effectiveDue: obligation.effectiveDue,
    statutoryDue: obligation.statutoryDue,
    windowOpens: obligation.windowOpens,
    status: obligation.status,
    portalUrl: obligation.portalUrl,
  })));

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="tax-obligations-${fy.replace(/^FY/, "")}.ics"`,
    },
  });
}
