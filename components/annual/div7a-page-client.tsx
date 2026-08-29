"use client";

import { useRef, useState } from "react";
import { Div7aAmalgamatedGroup } from "@/components/annual/div7a-amalgamated-group";
import { DateTextInput } from "@/components/date-text-input";
import type { Div7aLoanView } from "@/lib/domain/div7a/service";
import { groupDiv7aLoans } from "@/lib/domain/div7a/amalgamated";
import type { DateOnly } from "@/lib/time/melbourne";

export function Div7aPageClient({ entities, initialLoans }: { entities: Array<{ id: string; name: string }>; initialLoans: Div7aLoanView[] }) {
  const [loans, setLoans] = useState(initialLoans);
  const [assessmentIncomeYear, setAssessmentIncomeYear] = useState("FY2026-27");
  const assessmentIncomeYearRef = useRef("FY2026-27");
  const refreshRequestId = useRef(0);
  const [lenderEntityId, setLenderEntityId] = useState(entities[0]?.id ?? "");
  const [borrower, setBorrower] = useState("");
  const [loanDate, setLoanDate] = useState<DateOnly | null>(null);
  const [principal, setPrincipal] = useState("");
  const [termYears, setTermYears] = useState("7");
  const [agreementSigned, setAgreementSigned] = useState(false);
  const [securityType, setSecurityType] = useState<"unsecured" | "registered_mortgage" | "unknown">("unknown");
  const [message, setMessage] = useState("");

  const groups = groupDiv7aLoans(loans.map((loan) => ({
    id: loan.id,
    lenderEntityId: loan.lenderEntityId,
    borrower: loan.borrower,
    loanIncomeYear: loan.loanIncomeYear,
    securityType: loan.securityType,
    minimumRepaymentCents: loan.minimumRepaymentCents,
  })));

  async function refresh(fy = assessmentIncomeYearRef.current) {
    const requestId = ++refreshRequestId.current;
    const response = await fetch(`/api/div7a?fy=${encodeURIComponent(fy)}`);
    const payload = await response.json() as { loans?: Div7aLoanView[] };
    if (response.ok && requestId === refreshRequestId.current) setLoans(payload.loans ?? []);
  }

  async function createLoan(event: React.FormEvent) {
    event.preventDefault();
    if (!lenderEntityId || !borrower.trim() || !loanDate || !principal.trim()) { setMessage("主体、借款人、贷款日和本金均为必填"); return; }
    const response = await fetch("/api/div7a", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", lenderEntityId, borrower, loanDate, principal, termYears: Number(termYears), securityType, agreementSigned }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "贷款保存失败"); return; }
    setMessage("Div 7A 贷款已保存；年度基准利率请在设置页按所得年度手动录入"); setBorrower(""); setLoanDate(null); setPrincipal(""); await refresh();
  }

  return <main className="ledger-shell" data-testid="div7a-page"><aside className="app-rail"><div className="brand-lockup">税务合规看板</div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/annual">年度底稿</a><a className="nav-item active" href="/div7a">Div 7A</a><a className="nav-item" href="/assets">资产</a><a className="nav-item" href="/super">养老金</a><a className="nav-item" href="/settings">设置</a></nav></aside><section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 7 · Div 7A 补强</p><h1>Div 7A</h1><p>贷款发放当年最低还款为零；从下一个所得年度开始计算。年度基准利率只从设置页按所得年度读取，缺少年度行时显示“无法判断”。</p></div></header><div className="annual-toolbar"><label><span>评估所得年度</span><select value={assessmentIncomeYear} onChange={(event) => { const next = event.target.value; assessmentIncomeYearRef.current = next; setAssessmentIncomeYear(next); void refresh(next); }}><option value="FY2016-17">FY2016–17</option><option value="FY2017-18">FY2017–18</option><option value="FY2018-19">FY2018–19</option><option value="FY2019-20">FY2019–20</option><option value="FY2020-21">FY2020–21</option><option value="FY2021-22">FY2021–22</option><option value="FY2022-23">FY2022–23</option><option value="FY2023-24">FY2023–24</option><option value="FY2024-25">FY2024–25</option><option value="FY2025-26">FY2025–26</option><option value="FY2026-27">FY2026–27</option></select></label></div><form className="ledger-upload-card" onSubmit={(event) => void createLoan(event)}><div className="ledger-card-heading"><p className="page-kicker">新增贷款</p><h2>记录 Div 7A 贷款</h2></div><div className="ledger-form-grid"><label><span>贷款方公司</span><select value={lenderEntityId} onChange={(event) => setLenderEntityId(event.target.value)}><option value="">请选择</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label><span>借款人</span><input value={borrower} onChange={(event) => setBorrower(event.target.value)} /></label><label><span>贷款日（DD/MM/YYYY）</span><DateTextInput ariaLabel="贷款日" value={loanDate} onChange={setLoanDate} /></label><label><span>本金（AUD）</span><input value={principal} onChange={(event) => setPrincipal(event.target.value)} placeholder="100000.00" inputMode="decimal" /></label><label><span>原始期限（年，1–25）</span><input value={termYears} onChange={(event) => setTermYears(event.target.value)} inputMode="numeric" /></label><label><span>担保类型（未知不会默认七年）</span><select value={securityType} onChange={(event) => setSecurityType(event.target.value as typeof securityType)}><option value="unknown">无法判断</option><option value="unsecured">无担保（最高 7 年）</option><option value="registered_mortgage">注册不动产抵押（最高 25 年）</option></select></label></div><label className="annual-checkbox"><input type="checkbox" checked={agreementSigned} onChange={(event) => setAgreementSigned(event.target.checked)} />协议已签署（仍需补齐协议核对资料）</label><button type="submit" className="primary-button">保存贷款</button><p className="form-message" aria-live="polite">{message}</p></form><section className="div7a-list">{loans.length ? groups.map((group) => <Div7aAmalgamatedGroup key={group.key} group={group} loans={loans} onChanged={() => void refresh()} />) : <p className="empty-state">尚未记录 Div 7A 贷款。</p>}</section></section></main>;
}
