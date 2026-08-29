import { formatCents } from "@/lib/money";
import type { PersonalTaxSummary } from "@/lib/domain/annual/personal";
import { displayIncomeYear } from "@/lib/domain/annual/labels";
import { ManualItems } from "@/components/annual/company-worksheet";

export function PersonalSummary({ summary }: { summary: PersonalTaxSummary }) {
  return (
    <section className="annual-worksheet-card" data-testid="personal-worksheet">
      <div className="annual-card-heading"><div><p className="page-kicker">个人年度底稿</p><h2>{displayIncomeYear(summary.incomeYear)} · {summary.entityName}</h2></div><span>{summary.noticeSubmitted ? "通知已记录" : "通知待处理"}</span></div>
      <div className="annual-metric-grid"><div><span>可抵扣供款</span><strong>{formatCents(summary.concessionalContributionsCents)}</strong></div><div><span>信托分配（人工）</span><strong>{formatCents(summary.trustDistributionCents)}</strong></div><div><span>分红（人工）</span><strong>{formatCents(summary.dividendCents)}</strong></div><div><span>Franking credit（人工）</span><strong>{formatCents(summary.frankingCreditsCents)}</strong></div></div>
      <div className="annual-metric-grid"><div><span>总折旧额（不含 GST）</span><strong>{summary.depreciationCents === null ? "无法判断" : formatCents(summary.depreciationCents)}</strong></div><div><span>可抵扣折旧额（按私人使用调整，不含 GST）</span><strong>{summary.deductibleDepreciationCents === null ? "无法判断" : formatCents(summary.deductibleDepreciationCents)}</strong></div></div>
      {summary.assetDepreciationStatus === "manual_review" ? <p className="annual-independent-note danger-text">资产折旧无法判断：期初余额或人工参数未配置，系统未假设为零。</p> : null}
      {summary.assetDepreciationRows.some((row) => row.vehicleWarning) ? <p className="annual-independent-note">车辆提示：私人使用可能另有 FBT 或 Div 7A 后果，尚未评估；请先查看<a href="/vehicle-fact-checklist" target="_blank" rel="noreferrer">车辆事实清单</a>。</p> : null}
      <p className="annual-independent-note">年度交易收入与费用口径：不含 GST。</p>
      <p className="annual-independent-note">供款到账与抵扣意向通知是两个独立待办；本页不会因其中一个完成而自动关闭另一个。</p>
      <ManualItems items={summary.manualItems} />
    </section>
  );
}
