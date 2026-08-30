import { formatCents } from "@/lib/money";
import type { CompanyTaxWorksheet } from "@/lib/domain/annual/company";
import { displayIncomeYear } from "@/lib/domain/annual/labels";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";
import { ReconciliationPanel } from "@/components/annual/reconciliation-panel";

function annualMoney(value: number | null) {
  return value === null ? "无法判断" : formatCents(value);
}

export function CompanyWorksheet({ worksheet }: { worksheet: CompanyTaxWorksheet }) {
  return (
    <section className="annual-worksheet-card" data-testid="company-worksheet">
      <div className="annual-card-heading">
        <div>
          <p className="page-kicker">公司年度底稿</p>
          <h2>{displayIncomeYear(worksheet.incomeYear)} · {worksheet.entityName}</h2>
        </div>
        <span>{worksheet.transactionIds.length} 笔已确认交易</span>
      </div>
      <div className="annual-metric-grid">
        <div><span>收入（不含 GST）</span><strong>{formatCents(worksheet.incomeCents)}</strong></div>
        <div><span>运营费用（不含 GST）</span><strong>{formatCents(worksheet.operatingExpenseCents)}</strong></div>
        <div><span>资本采购（不含 GST，内部）</span><strong>{formatCents(worksheet.capitalPurchaseCents)}</strong></div>
        <div><span>总折旧额（不含 GST）</span><strong>{annualMoney(worksheet.depreciationCents)}</strong></div>
        <div><span>可抵扣折旧额（按私人使用调整，不含 GST）</span><strong>{annualMoney(worksheet.deductibleDepreciationCents)}</strong></div>
        <div><span>账面净利润（不含 GST）</span><strong>{annualMoney(worksheet.netProfitCents)}</strong></div>
      </div>
      {worksheet.assetDepreciationStatus === "manual_review" ? <p className="annual-independent-note danger-text">资产折旧无法判断：期初余额或人工参数未配置，系统未假设为零。</p> : null}
      {worksheet.assetDepreciationRows.some((row) => row.vehicleWarning) ? <p className="annual-independent-note">车辆提示：私人使用可能另有 FBT 或 Div 7A 后果，尚未评估；请先查看<a href="/vehicle-fact-checklist" target="_blank" rel="noreferrer">车辆事实清单</a>。</p> : null}
      <ReconciliationPanel entityId={worksheet.entityId} incomeYear={worksheet.incomeYear} reconciliation={worksheet.reconciliation} />
      <ManualItems items={worksheet.manualItems} />
      <TransactionList transactions={worksheet.transactions} />
    </section>
  );
}

export function ManualItems({ items }: { items: string[] }) {
  return <section className="annual-manual-items"><h3>待人工补充</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}

function TransactionList({ transactions }: { transactions: CompanyTaxWorksheet["transactions"] }) {
  return (
    <details className="annual-transactions">
      <summary>来源交易（金额不含 GST，{transactions.length} 条）</summary>
      {transactions.length ? <ul>{transactions.map((transaction) => <li key={transaction.id}>#{transaction.id} · {formatDueDate(transaction.date as DateOnly)} · {transaction.description} · {formatCents(transaction.amountExcludingGstCents)}</li>)}</ul> : <p>本所得年度没有已确认交易。</p>}
    </details>
  );
}
