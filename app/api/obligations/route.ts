import { ensureObligationsForFy } from "@/lib/domain/obligations/repository";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fy = url.searchParams.get("fy") ?? "2026-27";
    const obligations = ensureObligationsForFy(fy);
    return Response.json({ fy: fy.startsWith("FY") ? fy : `FY${fy}`, obligations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "义务暂时不可用";
    return Response.json({ error: message }, { status: 400 });
  }
}
