import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { buildCompanyTaxWorksheet } from "@/lib/domain/annual/company";
import { buildPersonalTaxSummary } from "@/lib/domain/annual/personal";
import { buildTrustDistributionDraft } from "@/lib/domain/annual/trust";
import { confirmAnnualReconciliation } from "@/lib/domain/annual/company";
import { confirmTrustDistributionDifference, saveTrustDistribution } from "@/lib/domain/annual/trust-distributions";
import { parseMoneyToCents } from "@/lib/money";
import { currentFinancialYear } from "@/lib/domain/obligations/calculator";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    runMigrations();
    const url = new URL(request.url);
    const fy = url.searchParams.get("fy") ?? currentFinancialYear();
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
    return Response.json({ incomeYear: fy.startsWith("FY") ? fy : `FY${fy}`, amountBasis: "GST-exclusive", worksheets });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "年度底稿暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: string;
      entityId?: string;
      trustEntityId?: string;
      beneficiaryEntityId?: string;
      incomeYear?: string;
      amountCents?: number;
      amount?: string;
      resolutionDate?: string;
      status?: "proposed" | "signed";
      sourceDescription?: string;
      enteredBy?: string;
      explanation?: string;
    };
    if (body.action === "trust_distribution") {
      if (!body.trustEntityId || !body.incomeYear || !body.beneficiaryEntityId || !body.resolutionDate || !body.status || body.amountCents === undefined && body.amount === undefined || !body.sourceDescription || !body.enteredBy) {
        return Response.json({ error: "信托、所属年度、受益人、金额、决议日、状态、来源说明和录入人均为必填" }, { status: 400 });
      }
      const amountCents = body.amountCents ?? parseMoneyToCents(body.amount as string);
      return Response.json({ distribution: saveTrustDistribution({ trustEntityId: body.trustEntityId, incomeYear: body.incomeYear, beneficiaryEntityId: body.beneficiaryEntityId, amountCents, resolutionDate: body.resolutionDate, status: body.status, sourceDescription: body.sourceDescription, enteredBy: body.enteredBy }) }, { status: 201 });
    }
    if (body.action === "confirm_reconciliation") {
      if (!body.entityId || !body.incomeYear || !body.enteredBy) return Response.json({ error: "主体、所属年度和确认人均为必填" }, { status: 400 });
      return Response.json({ reconciliation: confirmAnnualReconciliation({ entityId: body.entityId, incomeYear: body.incomeYear, explanation: body.explanation ?? "", enteredBy: body.enteredBy }) });
    }
    if (body.action === "confirm_trust_distribution_difference") {
      if (!body.trustEntityId || !body.incomeYear || !body.enteredBy || !body.explanation?.trim()) return Response.json({ error: "信托、所属年度、说明和确认人均为必填" }, { status: 400 });
      const draft = buildTrustDistributionDraft(body.trustEntityId, body.incomeYear);
      if (draft.distributionDifferenceCents === null) return Response.json({ error: "信托可分配收入仍无法判断，不能确认分配差额" }, { status: 400 });
      if (draft.distributionDifferenceCents === 0) return Response.json({ error: "当前没有需要确认的分配差额" }, { status: 400 });
      confirmTrustDistributionDifference({ trustEntityId: body.trustEntityId, incomeYear: body.incomeYear, differenceCents: draft.distributionDifferenceCents, explanation: body.explanation, enteredBy: body.enteredBy });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "无效的年度底稿操作" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "年度底稿保存失败" }, { status: 400 });
  }
}
