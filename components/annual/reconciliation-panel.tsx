"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import type { AnnualReconciliation } from "@/lib/domain/annual/company";

export function ReconciliationPanel({ entityId, incomeYear, reconciliation }: { entityId: string; incomeYear: string; reconciliation: AnnualReconciliation }) {
  const [explanation, setExplanation] = useState("");
  const [message, setMessage] = useState("");
  async function confirm() {
    if (reconciliation.differenceCents !== 0 && !explanation.trim()) { setMessage("差额不为零时必须逐项确认或填写原因"); return; }
    const response = await fetch("/api/annual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm_reconciliation", entityId, incomeYear, explanation, enteredBy: "self" }) });
    const payload = await response.json() as { error?: string };
    setMessage(response.ok ? "对账确认已写入审计记录" : payload.error ?? "对账确认失败");
  }
  return <section className="annual-reconciliation" aria-label="BAS 与年度底稿对账" data-testid="annual-reconciliation">
    <h3>BAS 与年度底稿对账（非阻断式）</h3>
    <div className="reconciliation-summary"><span>BAS G1：<strong>{formatCents(reconciliation.basG1Cents)}</strong></span><span>BAS 1A：<strong>{formatCents(reconciliation.bas1ACents)}</strong></span><span>GST net：<strong>{formatCents(reconciliation.basNetCents)}</strong></span><span>年度收入：<strong>{formatCents(reconciliation.annualIncomeCents)}</strong></span><span>差额：<strong>{formatCents(reconciliation.differenceCents)}</strong></span></div>
    <p>差额 = BAS G1 − BAS 1A − 年度收入。差额不自动阻断；请按 GST 代码逐笔核对合法例外。</p>
    <div className="table-scroll"><table className="settings-table"><thead><tr><th>GST 代码</th><th>BAS G1</th><th>BAS 1A</th><th>年度收入</th><th>差额</th></tr></thead><tbody>{reconciliation.groups.map((group) => <tr key={group.gstCode}><td>{group.gstCode}</td><td>{formatCents(group.basG1Cents)}</td><td>{formatCents(group.bas1ACents)}</td><td>{formatCents(group.annualIncomeCents)}</td><td>{formatCents(group.differenceCents)}</td></tr>)}</tbody></table></div>
    <label><span>确认/差额说明</span><textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder={reconciliation.differenceCents === 0 ? "可选：记录本次对账说明" : "请逐项说明差额构成"} /></label><button type="button" className="secondary-button" onClick={() => void confirm()}>{reconciliation.confirmed ? "更新对账审计" : "确认年度对账"}</button><p className="form-message" aria-live="polite">{message}</p>
  </section>;
}
