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
