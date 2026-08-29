import { formatCents } from "@/lib/money";
import type { TrustDistributionDraft } from "@/lib/domain/annual/trust";
import { displayIncomeYear } from "@/lib/domain/annual/labels";
import { ManualItems } from "@/components/annual/company-worksheet";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";

function annualMoney(value: number | null) {
  return value === null ? "无法判断" : formatCents(value);
}

export function TrustResolutionForm({ draft }: { draft: TrustDistributionDraft }) {
  return (
    <section className="annual-worksheet-card" data-testid="trust-worksheet">
      <div className="annual-card-heading"><div><p className="page-kicker">信托年度底稿</p><h2>{displayIncomeYear(draft.incomeYear)} · {draft.entityName}</h2></div><span>决议草稿</span></div>
      <div className="annual-metric-grid"><div><span>可分配收入（不含 GST，计算草稿）</span><strong>{annualMoney(draft.distributableIncomeCents)}</strong></div><div><span>总折旧额（不含 GST）</span><strong>{annualMoney(draft.depreciationCents)}</strong></div><div><span>可抵扣折旧额（按私人使用调整，不含 GST）</span><strong>{annualMoney(draft.deductibleDepreciationCents)}</strong></div><div><span>受益人分配</span><strong>{draft.beneficiaryAllocations.length ? `${draft.beneficiaryAllocations.length} 项` : "待人工填写"}</strong></div></div>
      {draft.assetDepreciationStatus === "manual_review" ? <p className="annual-independent-note danger-text">资产折旧无法判断：期初余额或人工参数未配置，系统未假设为零。</p> : null}
      {draft.assetDepreciationRows.some((row) => row.vehicleWarning) ? <p className="annual-independent-note">车辆提示：私人使用可能另有 FBT 或 Div 7A 后果，尚未评估；请先查看<a href="/vehicle-fact-checklist" target="_blank" rel="noreferrer">车辆事实清单</a>。</p> : null}
      <pre className="resolution-template">{draft.resolutionText}</pre>
      <ManualItems items={draft.manualItems} />
      <details className="annual-transactions"><summary>来源交易（金额不含 GST，{draft.transactions.length} 条）</summary><ul>{draft.transactions.map((transaction) => <li key={transaction.id}>#{transaction.id} · {formatDueDate(transaction.date as DateOnly)} · {transaction.description} · {formatCents(transaction.amountExcludingGstCents)}</li>)}</ul></details>
    </section>
  );
}
