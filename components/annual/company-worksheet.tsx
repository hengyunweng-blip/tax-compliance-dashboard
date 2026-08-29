import { formatCents } from "@/lib/money";
import type { CompanyTaxWorksheet } from "@/lib/domain/annual/company";
import { displayIncomeYear } from "@/lib/domain/annual/labels";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";

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
        <div><span>账面净利润（不含 GST）</span><strong>{formatCents(worksheet.netProfitCents)}</strong></div>
      </div>
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
