"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { DateTextInput } from "@/components/date-text-input";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";
import type { Div7aSummary } from "@/lib/domain/div7a/service";

export function Div7aLoanCard({ loan, onChanged }: { loan: Div7aSummary; onChanged: () => void }) {
  const [date, setDate] = useState<DateOnly | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  async function addRepayment() {
    if (!date || !amount.trim()) { setMessage("还款日期和金额均为必填"); return; }
    const response = await fetch("/api/div7a", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "repayment", loanId: loan.id, date, amount }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "还款保存失败"); return; }
    setDate(null); setAmount(""); setMessage("还款已记录"); onChanged();
  }

  return <article className="div7a-loan-card" data-testid="div7a-loan-card"><div className="annual-card-heading"><div><p className="page-kicker">{loan.lenderEntityName}</p><h2>{loan.borrower}</h2></div><span>{loan.agreementSigned ? "协议已签署" : "协议待签署"}</span></div><p className="div7a-meta">贷款日：{formatDueDate(loan.loanDate)} · 所属年度：{loan.loanIncomeYear.replace("-", "–")} · 手动基准利率：{loan.benchmarkRate}</p><div className="annual-metric-grid"><div><span>本金</span><strong>{formatCents(loan.principalCents)}</strong></div><div><span>{loan.assessmentIncomeYear.replace("-", "–")} 最低还款</span><strong>{formatCents(loan.minimumRepaymentCents)}</strong></div><div><span>已记录还款</span><strong>{formatCents(loan.actualRepaymentCents)}</strong></div><div><span>缺口</span><strong className={loan.shortfallCents ? "danger-text" : ""}>{formatCents(loan.shortfallCents)}</strong></div></div><p className="div7a-due-note">还款截止：{formatDueDate(loan.repaymentDue)} · {loan.daysUntilRepaymentDue < 0 ? `已过 ${Math.abs(loan.daysUntilRepaymentDue)} 天` : `${loan.daysUntilRepaymentDue} 天后`}</p><div className="div7a-repayment-form"><label><span>还款日期（DD/MM/YYYY）</span><DateTextInput ariaLabel={`贷款 ${loan.id} 还款日期`} value={date} onChange={setDate} /></label><label><span>金额（AUD）</span><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" /></label><button type="button" className="secondary-button" onClick={() => void addRepayment()}>记录还款</button></div><p className="form-message" aria-live="polite">{message}</p></article>;
}
