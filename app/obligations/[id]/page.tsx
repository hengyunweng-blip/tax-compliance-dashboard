import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDueDate } from "@/lib/time/melbourne";
import { calculateLicenceCancellationDate } from "@/lib/domain/obligations/calculator";
import { ensureObligationsForFy, getObligationById } from "@/lib/domain/obligations/repository";
import { TransitionForm } from "@/components/obligations/transition-form";

export const dynamic = "force-dynamic";

function displayIncomeYear(incomeYear: string) {
  return incomeYear.replace("-", "–");
}

function agreementDetails(notes: string | null) {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { loanId?: unknown; lodgmentDay?: unknown; benchmarkRate?: unknown; assessment?: { status?: unknown; missingInputs?: unknown; reasons?: unknown } };
    const assessment = parsed.assessment;
    return {
      loanId: typeof parsed.loanId === "number" ? parsed.loanId : null,
      lodgmentDay: typeof parsed.lodgmentDay === "string" ? parsed.lodgmentDay : null,
      benchmarkRate: typeof parsed.benchmarkRate === "string" ? parsed.benchmarkRate : null,
      status: typeof assessment?.status === "string" ? assessment.status : "blocked",
      missingInputs: Array.isArray(assessment?.missingInputs) ? assessment.missingInputs.filter((item): item is string => typeof item === "string") : [],
      reasons: Array.isArray(assessment?.reasons) ? assessment.reasons.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return null;
  }
}

const STATUS_LABELS: Record<string, string> = {
  blocked: "待配置",
  todo: "待处理",
  collecting: "录入中",
  draft_ready: "底稿就绪",
  lodged: "已递交",
  paid: "已缴款",
  na: "不适用",
};

export default async function ObligationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  ensureObligationsForFy("2026-27");
  const { id } = await params;
  const obligation = getObligationById(Number(id));
  if (!obligation) {
    notFound();
  }
  const isLicence = obligation.ruleId === "estate_agent_licence_annual_statement";
  const isDiv7aAgreement = obligation.ruleId === "div7a_loan_agreement";
  const div7aDetails = isDiv7aAgreement ? agreementDetails(obligation.notes) : null;
  const licenceCancellationDate = isLicence && obligation.statutoryDue
    ? calculateLicenceCancellationDate(obligation.statutoryDue)
    : null;

  return (
    <main className="detail-shell">
      <header className="detail-header">
        <Link className="back-link" href="/">← 返回看板</Link>
        <span className="detail-status">{STATUS_LABELS[obligation.status] ?? obligation.status}</span>
      </header>
      <section className="detail-panel">
        <p className="page-kicker">{obligation.entityName} · {obligation.periodLabel}</p>
        <h1>{displayIncomeYear(obligation.incomeYear)} {obligation.ruleLabel}{obligation.statutoryDue ? ` · 截止 ${formatDueDate(obligation.statutoryDue)}` : " · 日期待配置"}</h1>
        <div className="detail-dates">
          <div>
            <span>{isLicence ? "周年日（截止）" : "法定日"}</span>
            <strong>{obligation.statutoryDue ? formatDueDate(obligation.statutoryDue) : "待配置"}</strong>
          </div>
          <div>
            <span>{isLicence ? "工作日校准" : "实际工作日"}</span>
            <strong>{obligation.effectiveDue ? formatDueDate(obligation.effectiveDue) : "待配置"}</strong>
          </div>
          {isLicence && obligation.windowOpens ? (
            <div>
              <span>窗口开启日</span>
              <strong>{formatDueDate(obligation.windowOpens)}</strong>
            </div>
          ) : null}
          <div>
            <span>截止日所在财年</span>
            <strong>{displayIncomeYear(obligation.deadlineFy)}</strong>
          </div>
          {obligation.lodgedAt ? <div><span>实际递交日期</span><strong>{formatDueDate(obligation.lodgedAt)}</strong></div> : null}
          {obligation.paidAt ? <div><span>实际缴款日期</span><strong>{formatDueDate(obligation.paidAt)}</strong></div> : null}
        </div>
        <p className="detail-note">此卡所属所得年度为 {displayIncomeYear(obligation.incomeYear)}；截止日所在财年为 {displayIncomeYear(obligation.deadlineFy)}。</p>
        {isDiv7aAgreement ? (
          <div className="detail-div7a-agreement" data-testid="div7a-agreement-detail">
            <h2>协议条件核对</h2>
            <p>贷款范围：{div7aDetails?.loanId ? `贷款 ${div7aDetails.loanId}` : "无法判断"} · lodgment day：{div7aDetails?.lodgmentDay ? formatDueDate(div7aDetails.lodgmentDay as `${number}-${number}-${number}`) : "无法判断"} · 适用基准利率：{div7aDetails?.benchmarkRate ?? "未配置"}</p>
            {div7aDetails?.missingInputs.length ? <p>缺少资料：{div7aDetails.missingInputs.join("、")}</p> : null}
            {div7aDetails?.reasons.length ? <p className="danger-text">核对警告：{div7aDetails.reasons.join("；")}</p> : null}
            {!div7aDetails?.missingInputs.length && !div7aDetails?.reasons.length ? <p>协议资料已通过当前规则核对；仍请保留原始文件和人工判断依据。</p> : null}
          </div>
        ) : null}
        {licenceCancellationDate ? (
          <p className="detail-licence-consequence"><strong>牌照后果：</strong>周年日后 21 天仍未完成年度声明，牌照将自动注销（{formatDueDate(licenceCancellationDate)}）。</p>
        ) : null}
        <div className="detail-checklist">
          <h2>准备清单</h2>
          {obligation.checklist.length > 0 ? (
            <ul>{obligation.checklist.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : <p>本义务暂无预设清单。</p>}
        </div>
        <TransitionForm obligationId={obligation.id} status={obligation.status} />
      </section>
    </main>
  );
}
