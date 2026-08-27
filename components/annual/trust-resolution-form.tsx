import { formatCents } from "@/lib/money";
import type { TrustDistributionDraft } from "@/lib/domain/annual/trust";
import { displayIncomeYear } from "@/lib/domain/annual/labels";
import { ManualItems } from "@/components/annual/company-worksheet";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";

export function TrustResolutionForm({ draft }: { draft: TrustDistributionDraft }) {
  return (
    <section className="annual-worksheet-card" data-testid="trust-worksheet">
      <div className="annual-card-heading"><div><p className="page-kicker">信托年度底稿</p><h2>{displayIncomeYear(draft.incomeYear)} · {draft.entityName}</h2></div><span>决议草稿</span></div>
      <div className="annual-metric-grid"><div><span>可分配收入（计算草稿）</span><strong>{formatCents(draft.distributableIncomeCents)}</strong></div><div><span>受益人分配</span><strong>{draft.beneficiaryAllocations.length ? `${draft.beneficiaryAllocations.length} 项` : "待人工填写"}</strong></div></div>
      <pre className="resolution-template">{draft.resolutionText}</pre>
      <ManualItems items={draft.manualItems} />
      <details className="annual-transactions"><summary>来源交易（{draft.transactions.length} 条）</summary><ul>{draft.transactions.map((transaction) => <li key={transaction.id}>#{transaction.id} · {formatDueDate(transaction.date as DateOnly)} · {transaction.description} · {formatCents(transaction.amountCents)}</li>)}</ul></details>
    </section>
  );
}
