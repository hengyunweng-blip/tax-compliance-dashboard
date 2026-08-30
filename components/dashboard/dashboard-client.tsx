"use client";

import { differenceInCalendarDays } from "date-fns";
import { useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Filter, ShieldCheck } from "lucide-react";
import type { ObligationView } from "@/lib/domain/obligations/repository";
import { formatDueDate, parseMelbourneDate, todayInMelbourne } from "@/lib/time/melbourne";

type DashboardEntity = {
  id: string;
  name: string;
  type: string;
};

type Props = {
  entities: DashboardEntity[];
  obligations: ObligationView[];
};

const STATUS_LABELS: Record<string, string> = {
  blocked: "待配置",
  todo: "待处理",
  collecting: "录入中",
  draft_ready: "底稿就绪",
  lodged: "已递交",
  paid: "已缴款",
  na: "不适用",
};

function displayIncomeYear(incomeYear: string) {
  return incomeYear.replace("-", "–");
}

function daysUntil(date: ObligationView["effectiveDue"], statutoryDue: ObligationView["statutoryDue"] = null): number | null {
  const reminderDue = date ?? statutoryDue;
  if (!reminderDue) return null;
  return differenceInCalendarDays(parseMelbourneDate(reminderDue), parseMelbourneDate(todayInMelbourne()));
}

function countdownLabel(days: number | null) {
  if (days === null) return "待配置";
  if (days < 0) return `逾期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  return `${days} 天后到期`;
}

function statusClass(status: string) {
  return status === "blocked" ? "obligation-status blocked" : status === "paid" ? "obligation-status paid" : "obligation-status";
}

function agreementSummary(obligation: ObligationView) {
  if (obligation.ruleId !== "div7a_loan_agreement" || !obligation.notes) return null;
  try {
    const parsed = JSON.parse(obligation.notes) as { loanId?: unknown; assessment?: { status?: unknown } };
    const loanId = typeof parsed.loanId === "number" ? parsed.loanId : obligation.scopeKey.replace(/^loan:/, "");
    const assessment = parsed.assessment?.status === "compliant" ? "条款已核对" : parsed.assessment?.status === "not_compliant" ? "条款不合规" : "无法判断 / 资料不完整";
    return `贷款 ${loanId} · ${assessment}`;
  } catch {
    return `贷款 ${obligation.scopeKey.replace(/^loan:/, "") } · 无法判断`;
  }
}

function ObligationCard({ obligation }: { obligation: ObligationView }) {
  const days = daysUntil(obligation.effectiveDue, obligation.statutoryDue);
  const isLicence = obligation.ruleId === "estate_agent_licence_annual_statement";
  const dueSoon = days !== null && days >= 0 && days <= 7;
  const licenceHighRisk = isLicence && days !== null && days < 0;
  return (
    <article
      className={`obligation-card ${days !== null && days < 0 ? "overdue" : dueSoon ? "due-soon" : ""} ${licenceHighRisk ? "licence-high-risk" : ""}`}
      data-testid={`obligation-card-${obligation.id}`}
      data-rule-id={obligation.ruleId}
      data-entity-id={obligation.entityId}
      data-period-label={obligation.periodLabel}
      data-statutory-due={obligation.statutoryDue ?? undefined}
      data-effective-due={obligation.effectiveDue ?? undefined}
    >
      <div className="obligation-card-topline">
        <span className={statusClass(obligation.status)}>{STATUS_LABELS[obligation.status] ?? obligation.status}</span>
        {licenceHighRisk ? <span className="obligation-risk-label">最高危险</span> : null}
        <span className="obligation-countdown">{countdownLabel(days)}</span>
      </div>
      <h3>{displayIncomeYear(obligation.incomeYear)} {obligation.ruleLabel} · {obligation.statutoryDue ? `截止 ${formatDueDate(obligation.statutoryDue)}` : "日期待配置"}</h3>
      {agreementSummary(obligation) ? <p className="obligation-agreement-summary">{agreementSummary(obligation)}</p> : null}
      {isLicence && obligation.windowOpens ? (
        <div className="obligation-date-row obligation-window-row">
          <CalendarDays size={15} aria-hidden="true" />
          <span>窗口开启日：{formatDueDate(obligation.windowOpens)}</span>
        </div>
      ) : null}
      <div className="obligation-date-row">
        <CalendarDays size={15} aria-hidden="true" />
      <span>{isLicence ? "工作日校准：" : "实际工作日："}{obligation.effectiveDue ? formatDueDate(obligation.effectiveDue) : obligation.statutoryDue ? `工作日校准待配置 · 按法定日提醒（${formatDueDate(obligation.statutoryDue)}）` : "待配置"}</span>
      </div>
      <div className="obligation-meta-row">
        <span>截止财年：{displayIncomeYear(obligation.deadlineFy)}</span>
        <a href={`/obligations/${obligation.id}`} aria-label={`查看${obligation.ruleLabel}详情`}>
          详情 <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export function DashboardClient({ entities, obligations }: Props) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [generationMessage, setGenerationMessage] = useState("");

  async function generateCurrentYear() {
    const response = await fetch("/api/obligations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const payload = await response.json() as { error?: string };
    setGenerationMessage(response.ok ? "当前财年义务已幂等生成，请刷新看板查看最新配置。" : payload.error ?? "义务生成失败");
  }

  const filteredObligations = useMemo(() => obligations.filter((obligation) => {
    if (statusFilter !== "all" && obligation.status !== statusFilter) return false;
    if (hideCompleted && ["lodged", "paid", "na"].includes(obligation.status)) return false;
    return true;
  }), [hideCompleted, obligations, statusFilter]);

  const overdueCount = obligations.filter((obligation) => {
    const days = daysUntil(obligation.effectiveDue, obligation.statutoryDue);
    return days !== null && days < 0 && obligation.status !== "paid";
  }).length;
  const dueSoonCount = obligations.filter((obligation) => {
    const days = daysUntil(obligation.effectiveDue, obligation.statutoryDue);
    return days !== null && days >= 0 && days <= 7 && obligation.status !== "paid";
  }).length;

  return (
    <main className="dashboard-shell" data-testid="dashboard">
      <aside className="app-rail dashboard-rail" aria-label="主导航">
        <div className="brand-lockup">
          <ShieldCheck size={27} strokeWidth={2.1} aria-hidden="true" />
          <span>税务合规看板</span>
        </div>
        <nav className="app-nav">
          <a href="/" className="nav-item active">看板</a>
          <a href="/upload" className="nav-item">上传</a>
          <a href="/import" className="nav-item">CSV 导入</a>
          <a href="/inbox" className="nav-item">Inbox</a>
          <a href="/annual" className="nav-item">年度底稿</a>
          <a href="/div7a" className="nav-item">Div 7A</a>
          <a href="/assets" className="nav-item">资产</a>
          <a href="/super" className="nav-item">养老金</a>
          <a href="/news" className="nav-item">资讯</a>
          <a href="/settings" className="nav-item">设置</a>
        </nav>
      </aside>

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="page-kicker">{obligations[0]?.deadlineFy?.replace("-", "–") ?? "当前财年"} 合规总览</p>
            <h1>税务合规看板</h1>
            <p className="dashboard-subtitle">六个固定主体 · 实际工作日按 Australia/Melbourne 计算</p>
          </div>
          <a className="dashboard-settings-link" href="/settings">打开设置</a>
        </header>

        <section className="urgent-banner" aria-label="紧急提醒">
          <div>
            <strong>{overdueCount > 0 ? `${overdueCount} 项已逾期` : "当前无逾期义务"}</strong>
            <span>{dueSoonCount > 0 ? `另有 ${dueSoonCount} 项将在 7 天内到期。` : "所有日期均按实际工作日显示。"}</span>
          </div>
          <span className="urgent-banner-note">法定日与实际日分开展示</span>
        </section>

        <div className="dashboard-toolbar" aria-label="看板筛选">
          <div className="dashboard-filter-label"><Filter size={15} aria-hidden="true" />筛选状态</div>
          <select aria-label="筛选状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">全部</option>
            <option value="blocked">待配置</option>
            <option value="todo">待处理</option>
            <option value="collecting">录入中</option>
            <option value="draft_ready">底稿就绪</option>
            <option value="lodged">已递交</option>
            <option value="paid">已缴款</option>
          </select>
          <label className="dashboard-checkbox">
            <input type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.target.checked)} />
            隐藏已完成
          </label>
          <button type="button" className="secondary-button" onClick={() => void generateCurrentYear()}>手动生成当前财年义务</button>
          <span className="dashboard-count">显示 {filteredObligations.length} 项</span>
          <span className="form-message" aria-live="polite">{generationMessage}</span>
        </div>

        <section className="entity-columns" aria-label="六主体义务看板">
          {entities.map((entity) => (
            <section className="entity-column" key={entity.id} data-testid={`entity-column-${entity.id}`}>
              <header className="entity-column-header">
                <div>
                  <h2>{entity.name}</h2>
                  <span>{entity.type === "company" ? "公司" : entity.type === "trust" ? "信托" : "个人"}</span>
                </div>
                <span className="entity-obligation-count">{filteredObligations.filter((item) => item.entityId === entity.id).length}</span>
              </header>
              <div className="entity-card-list">
                {filteredObligations.filter((item) => item.entityId === entity.id).map((obligation) => (
                  <ObligationCard key={obligation.id} obligation={obligation} />
                ))}
                {filteredObligations.every((item) => item.entityId !== entity.id) && (
                  <p className="empty-column">当前筛选无义务</p>
                )}
              </div>
            </section>
          ))}
        </section>
      </section>
    </main>
  );
}
