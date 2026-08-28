"use client";

import { useRef, useState } from "react";
import { Div7aLoanCard } from "@/components/annual/div7a-loan-card";
import { DateTextInput } from "@/components/date-text-input";
import type { Div7aSummary } from "@/lib/domain/div7a/service";
import type { DateOnly } from "@/lib/time/melbourne";

export function Div7aPageClient({ entities, initialLoans }: { entities: Array<{ id: string; name: string }>; initialLoans: Div7aSummary[] }) {
  const [loans, setLoans] = useState(initialLoans);
  const [assessmentIncomeYear, setAssessmentIncomeYear] = useState("FY2026-27");
  const assessmentIncomeYearRef = useRef("FY2026-27");
  const refreshRequestId = useRef(0);
  const [lenderEntityId, setLenderEntityId] = useState(entities[0]?.id ?? "");
  const [borrower, setBorrower] = useState("");
  const [loanDate, setLoanDate] = useState<DateOnly | null>(null);
  const [principal, setPrincipal] = useState("");
  const [termYears, setTermYears] = useState("7");
  const [benchmarkRate, setBenchmarkRate] = useState("");
  const [agreementSigned, setAgreementSigned] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh(fy = assessmentIncomeYearRef.current) {
    const requestId = ++refreshRequestId.current;
    const response = await fetch(`/api/div7a?fy=${encodeURIComponent(fy)}`);
    const payload = await response.json() as { loans?: Div7aSummary[] };
    if (response.ok && requestId === refreshRequestId.current) setLoans(payload.loans ?? []);
  }

  async function createLoan(event: React.FormEvent) {
    event.preventDefault();
    if (!lenderEntityId || !borrower.trim() || !loanDate || !principal.trim() || !benchmarkRate.trim()) { setMessage("主体、借款人、贷款日、本金和手动基准利率均为必填"); return; }
    const response = await fetch("/api/div7a", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", lenderEntityId, borrower, loanDate, principal, termYears: Number(termYears), benchmarkRate, agreementSigned }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "贷款保存失败"); return; }
    setMessage("Div 7A 贷款已保存；基准利率来自手动输入，不由系统推定"); setBorrower(""); setLoanDate(null); setPrincipal(""); setBenchmarkRate(""); await refresh();
  }

  return <main className="ledger-shell" data-testid="div7a-page"><aside className="app-rail"><div className="brand-lockup">税务合规看板</div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/annual">年度底稿</a><a className="nav-item active" href="/div7a">Div 7A</a><a className="nav-item" href="/super">养老金</a><a className="nav-item" href="/settings">设置</a></nav></aside><section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 5 · 关联方贷款</p><h1>Div 7A</h1><p>贷款发放当年最低还款为零；从下一个所得年度开始计算。利率必须由用户手动录入，系统不从年份推定。</p></div></header><div className="annual-toolbar"><label><span>评估所得年度</span><select value={assessmentIncomeYear} onChange={(event) => { const next = event.target.value; assessmentIncomeYearRef.current = next; setAssessmentIncomeYear(next); void refresh(next); }}><option value="FY2016-17">FY2016–17</option><option value="FY2017-18">FY2017–18</option><option value="FY2018-19">FY2018–19</option><option value="FY2019-20">FY2019–20</option><option value="FY2020-21">FY2020–21</option><option value="FY2021-22">FY2021–22</option><option value="FY2022-23">FY2022–23</option><option value="FY2023-24">FY2023–24</option><option value="FY2024-25">FY2024–25</option><option value="FY2025-26">FY2025–26</option><option value="FY2026-27">FY2026–27</option></select></label></div><form className="ledger-upload-card" onSubmit={(event) => void createLoan(event)}><div className="ledger-card-heading"><p className="page-kicker">新增贷款</p><h2>记录 Div 7A 贷款</h2></div><div className="ledger-form-grid"><label><span>贷款方公司</span><select value={lenderEntityId} onChange={(event) => setLenderEntityId(event.target.value)}><option value="">请选择</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label><span>借款人</span><input value={borrower} onChange={(event) => setBorrower(event.target.value)} /></label><label><span>贷款日（DD/MM/YYYY）</span><DateTextInput ariaLabel="贷款日" value={loanDate} onChange={setLoanDate} /></label><label><span>本金（AUD）</span><input value={principal} onChange={(event) => setPrincipal(event.target.value)} placeholder="100000.00" inputMode="decimal" /></label><label><span>原始期限（年，1–25）</span><input value={termYears} onChange={(event) => setTermYears(event.target.value)} inputMode="numeric" /></label><label><span>基准利率（手动，小数或百分比）</span><input value={benchmarkRate} onChange={(event) => setBenchmarkRate(event.target.value)} placeholder="0.053 或 5.30%" /></label></div><label className="annual-checkbox"><input type="checkbox" checked={agreementSigned} onChange={(event) => setAgreementSigned(event.target.checked)} />协议已签署</label><button type="submit" className="primary-button">保存贷款</button><p className="form-message" aria-live="polite">{message}</p></form><section className="div7a-list">{loans.length ? loans.map((loan) => <Div7aLoanCard key={loan.id} loan={loan} onChanged={() => void refresh()} />) : <p className="empty-state">尚未记录 Div 7A 贷款。</p>}</section></section></main>;
}
