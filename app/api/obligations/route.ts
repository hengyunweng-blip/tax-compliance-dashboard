import { ensureObligationsForFy } from "@/lib/domain/obligations/repository";
import { currentFinancialYear } from "@/lib/domain/obligations/calculator";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fy = url.searchParams.get("fy") ?? currentFinancialYear();
    const obligations = ensureObligationsForFy(fy);
    return Response.json({ fy: fy.startsWith("FY") ? fy : `FY${fy}`, obligations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "义务暂时不可用";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { fy?: string };
    const fy = body.fy?.trim() || currentFinancialYear();
    return Response.json({ fy: fy.startsWith("FY") ? fy : `FY${fy}`, obligations: ensureObligationsForFy(fy) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "义务生成失败" }, { status: 400 });
  }
}
