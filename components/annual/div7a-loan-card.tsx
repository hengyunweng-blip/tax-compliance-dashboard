"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { DateTextInput } from "@/components/date-text-input";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";
import type { AgreementTermsStatus, SecurityType } from "@/lib/domain/div7a/opening-balances";
import type { Div7aLoanView, Div7aSummary } from "@/lib/domain/div7a/service";

function money(value: number | null) {
  return value === null ? "无法判断" : formatCents(value);
}

function rateDate(value: string | null) {
  return value ? formatDueDate(value as DateOnly) : "未配置";
}

function agreementLabel(value: AgreementTermsStatus) {
  return value === "compliant" ? "条款已核对" : value === "not_compliant" ? "条款不合规" : value === "needs_review" ? "需要人工核对" : "无法判断";
}

function securityLabel(value: SecurityType) {
  return value === "registered_mortgage" ? "注册不动产抵押" : value === "unsecured" ? "无担保" : "未知担保类型";
}

function scheduleValue(row: Div7aSummary, value: number | null) {
  if (row.repaymentStatus === "manual_review") return "无法判断";
  if (row.repaymentStatus === "expired" && value === 0) return "—";
  return money(value);
}

export function Div7aLoanCard({ loan, onChanged }: { loan: Div7aLoanView; onChanged: () => void }) {
  const [date, setDate] = useState<DateOnly | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [originalIncomeYear, setOriginalIncomeYear] = useState(loan.loanIncomeYear);
  const [originalTermYears, setOriginalTermYears] = useState(String(loan.originalTermYears));
  const [securityType, setSecurityType] = useState<SecurityType>(loan.securityType);
  const [agreementTermsStatus, setAgreementTermsStatus] = useState<AgreementTermsStatus>(loan.agreementTermsStatus);
  const [agreementSignedAt, setAgreementSignedAt] = useState<DateOnly | null>(loan.agreementSignedAt);
  const [agreementRateText, setAgreementRateText] = useState(loan.agreementRateText ?? "");
  const [agreementDocumentId, setAgreementDocumentId] = useState(loan.agreementDocumentId ? String(loan.agreementDocumentId) : "");
  const [sourceDescription, setSourceDescription] = useState("会计 FY2025–26 底稿");
  const [enteredBy, setEnteredBy] = useState("");
  const [enteredAt, setEnteredAt] = useState<DateOnly | null>(null);
  const [openingMessage, setOpeningMessage] = useState("");
  const [agreementMessage, setAgreementMessage] = useState("");

  async function reviewRepayment(repaymentId: string, decision: "confirmed_valid" | "excluded") {
    const response = await fetch("/api/div7a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "repayment_review", loanId: loan.id, repaymentId, decision }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "还款复核保存失败"); return; }
    setMessage(decision === "confirmed_valid" ? "已记录：用户核对无重借" : "已记录：该笔还款不计入最低还款");
    onChanged();
  }

  async function addRepayment() {
    if (!date || !amount.trim()) { setMessage("还款日期和金额均为必填"); return; }
    const response = await fetch("/api/div7a", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "repayment", loanId: loan.id, date, amount }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "还款保存失败"); return; }
    setDate(null); setAmount(""); setMessage("还款已记录"); onChanged();
  }

  async function saveOpeningBalance() {
    if (!openingBalance.trim() || !enteredBy.trim() || !enteredAt || !sourceDescription.trim()) {
      setOpeningMessage("期初余额、来源说明、录入人和录入日期均为必填");
      return;
    }
    const response = await fetch("/api/div7a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "opening_balance",
        loanId: loan.id,
        balance: openingBalance,
        asOfDate: "2026-06-30",
        originalIncomeYear,
        originalTermYears: Number(originalTermYears),
        securityType,
        agreementTermsStatus,
        agreementRateText: agreementRateText || null,
        agreementSignedAt,
        agreementDocumentId: agreementDocumentId ? Number(agreementDocumentId) : null,
        sourceDescription,
        enteredBy,
        enteredAt,
      }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setOpeningMessage(payload.error ?? "期初余额保存失败"); return; }
    setOpeningMessage("30 Jun 2026 期初余额及贷款资料已保存，并已写入审计记录");
    onChanged();
  }

  async function saveAgreement() {
    const response = await fetch("/api/div7a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "agreement",
        loanId: loan.id,
        agreementSignedAt,
        agreementDocumentId: agreementDocumentId ? Number(agreementDocumentId) : null,
        agreementRateText: agreementRateText || null,
        agreementTermsStatus,
        securityType,
      }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setAgreementMessage(payload.error ?? "协议资料保存失败"); return; }
    setAgreementMessage("协议资料已保存；系统仍会按截止日重新核对条件");
    onChanged();
  }

  return (
    <article className="div7a-loan-card" data-testid="div7a-loan-card">
      <div className="annual-card-heading">
        <div><p className="page-kicker">{loan.lenderEntityName}</p><h2>{loan.borrower}</h2></div>
        <span className={loan.repaymentStatus === "manual_review" ? "danger-text" : ""}>{loan.repaymentStatus === "manual_review" ? "无法判断" : loan.isExpired ? "已到期" : agreementLabel(loan.agreementTermsStatus)}</span>
      </div>
      <p className="div7a-meta">贷款日：{formatDueDate(loan.loanDate)} · 所属年度：{loan.loanIncomeYear.replace("-", "–")} · 原始期限：{loan.originalTermYears} 年 · 担保：{securityLabel(loan.securityType)} · 当前评估：{loan.assessmentIncomeYear.replace("-", "–")}</p>
      <p className="div7a-meta">适用年度基准利率：{loan.benchmarkRateText ?? "未配置"} · 来源：{loan.benchmarkRateSourceUrl ? <a href={loan.benchmarkRateSourceUrl} target="_blank" rel="noreferrer">ATO 官方页面</a> : "未配置"} · 取数日期：{rateDate(loan.benchmarkRateRetrievedAt)}</p>
      {loan.unresolvedReason ? <p className="div7a-due-note danger-text" data-testid="div7a-unresolved">{loan.unresolvedReason}</p> : null}

      <div className="annual-metric-grid">
        <div><span>{loan.assessmentIncomeYear.replace("-", "–")} 最低还款</span><strong>{loan.repaymentStatus === "origination" ? "无最低还款要求" : loan.isExpired ? "已到期" : money(loan.minimumRepaymentCents)}</strong></div>
        <div><span>期初余额（上一年度末）</span><strong>{money(loan.openingBalanceCents)}</strong></div>
        <div><span>本年利息</span><strong>{money(loan.interestCents)}</strong></div>
        <div><span>本年计入最低还款的实际还款</span><strong>{money(loan.actualRepaymentCents)}</strong></div>
        {loan.recordedRepaymentCents !== null && loan.recordedRepaymentCents !== loan.actualRepaymentCents ? <div><span>本年已记录还款（待 s109R 复核）</span><strong>{money(loan.recordedRepaymentCents)}</strong></div> : null}
        <div><span>期末余额</span><strong>{money(loan.closingBalanceCents)}</strong></div>
        <div><span>剩余年限</span><strong>{loan.remainingTermYears === null ? "无法判断" : loan.remainingTermYears === 0 ? "已到期" : `${loan.remainingTermYears} 年`}</strong></div>
        <div><span>协议状态</span><strong>{agreementLabel(loan.agreementTermsStatus)}</strong></div>
        <div><span>还款截止日</span><strong>{loan.repaymentDue ? formatDueDate(loan.repaymentDue) : "—"}</strong></div>
      </div>

      {loan.isExpired ? <>
        <p className="div7a-due-note">该贷款已超过原始 {loan.originalTermYears} 年期限，后续所得年度不再产生最低还款。</p>
        {loan.expiryWarning && loan.unresolvedBalanceCents !== null ? <p className="div7a-due-note danger-text" data-testid="div7a-expiry-warning">{loan.expiryWarning} 未清偿余额：{formatCents(loan.unresolvedBalanceCents)}。</p> : null}
      </> : loan.repaymentStatus === "origination" ? <p className="div7a-due-note">贷款发放年度无需最低还款；从下一所得年度起按上一年度末余额与当前剩余年限计算。</p> : loan.repaymentDue ? <p className="div7a-due-note">还款截止：{formatDueDate(loan.repaymentDue)} · {loan.daysUntilRepaymentDue !== null && loan.daysUntilRepaymentDue < 0 ? `已过 ${Math.abs(loan.daysUntilRepaymentDue)} 天` : `${loan.daysUntilRepaymentDue ?? 0} 天后`}</p> : null}
      {loan.shortfallCents !== null && loan.shortfallCents > 0 ? <p className="div7a-due-note danger-text" data-testid="div7a-shortfall-warning">最低还款缺口：{formatCents(loan.shortfallCents)}。缺口部分可能产生视同股息后果，请人工核对 ATO 规则。系统不自动创建分红记录。</p> : null}
      {loan.repaymentValidityRisks.length ? <section className="div7a-repayment-validity" aria-label="s109R 还款有效性复核" data-testid="div7a-repayment-validity">
        <h3>还款有效性复核</h3>
        <p className="div7a-due-note">系统仅按相邻借款活动提示风险，不自动判断 s109R，也不会把未复核还款扣入最低还款。</p>
        {loan.repaymentValidityRisks.map((risk) => <article key={risk.repaymentId} className={risk.reviewStatus === "unreviewed" ? "div7a-validity-warning" : "div7a-validity-reviewed"}>
          <strong>{risk.reviewStatus === "unreviewed" ? risk.message : risk.reviewStatus === "confirmed_valid" ? "已核对无重借" : "确认不计入"}</strong>
          <span>{formatDueDate(risk.repaymentDate)} · {formatCents(risk.amountCents)} · 筛查窗口 {risk.windowDays} 天</span>
          {risk.relatedTransactions.map((transaction) => <small key={`transaction-${transaction.id}`}>相关支出：{formatDueDate(transaction.date)} · {formatCents(transaction.amountCents)} · {transaction.description}</small>)}
          {risk.relatedLoans.map((relatedLoan) => <small key={`loan-${relatedLoan.id}`}>相关新增贷款：{formatDueDate(relatedLoan.loanDate)} · {formatCents(relatedLoan.principalCents)} · 贷款 {relatedLoan.id}</small>)}
          {risk.reviewStatus === "unreviewed" ? <div className="div7a-form-actions"><button type="button" className="secondary-button" onClick={() => void reviewRepayment(risk.repaymentId, "confirmed_valid")}>已核对无重借</button><button type="button" className="secondary-button" onClick={() => void reviewRepayment(risk.repaymentId, "excluded")}>确认不计入</button></div> : null}
        </article>)}
      </section> : null}

      <details className="div7a-schedule-details" open>
        <div className="table-scroll"><table className="div7a-schedule-table"><thead><tr><th>所得年度</th><th>利率 / 来源</th><th>期初余额</th><th>利息</th><th>最低还款</th><th>实际还款</th><th>期末余额</th><th>剩余年限</th><th>协议</th><th>还款截止</th><th>s109R</th></tr></thead><tbody>{loan.schedule.map((row) => <tr key={row.assessmentIncomeYear}><td>{row.assessmentIncomeYear.replace("-", "–")}</td><td>{row.benchmarkRateText ?? "未配置"}{row.benchmarkRateSourceUrl ? <a href={row.benchmarkRateSourceUrl} target="_blank" rel="noreferrer">来源</a> : null}</td><td>{scheduleValue(row, row.openingBalanceCents)}</td><td>{scheduleValue(row, row.interestCents)}</td><td>{row.repaymentStatus === "origination" ? "无最低还款要求" : row.repaymentStatus === "expired" ? "—" : scheduleValue(row, row.minimumRepaymentCents)}</td><td>{scheduleValue(row, row.actualRepaymentCents)}</td><td>{scheduleValue(row, row.closingBalanceCents)}</td><td>{row.remainingTermYears === null ? "无法判断" : row.remainingTermYears === 0 ? "已到期" : `${row.remainingTermYears} 年`}</td><td>{agreementLabel(row.agreementTermsStatus)}</td><td>{row.repaymentDue ? formatDueDate(row.repaymentDue) : "—"}</td><td>{row.repaymentValidityRisks.length ? row.repaymentValidityRisks.map((risk) => <span key={risk.repaymentId} className={risk.reviewStatus === "unreviewed" ? "danger-text" : ""}>{risk.reviewStatus === "unreviewed" ? "需复核" : risk.reviewStatus === "confirmed_valid" ? "已核对" : "不计入"}</span>) : "无提示"}</td></tr>)}</tbody></table></div>
      </details>

      <details className="div7a-opening-details">
        <summary>录入 30 Jun 2026 期初余额与协议资料</summary>
        <p className="div7a-due-note">适用于 FY2026–27 接手前已有贷款。余额来源必须是会计 FY2025–26 底稿；不录入历史还款。缺失时系统不假设为零或本金。</p>
        <div className="div7a-opening-form">
          <label><span>30 Jun 2026 未偿余额（AUD）</span><input value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="例如 50000.00" inputMode="decimal" /></label>
          <label><span>原始发放所得年度</span><input value={originalIncomeYear} onChange={(event) => setOriginalIncomeYear(event.target.value)} placeholder="FY2019-20" /></label>
          <label><span>原始期限（年）</span><input value={originalTermYears} onChange={(event) => setOriginalTermYears(event.target.value)} inputMode="numeric" /></label>
          <label><span>担保类型</span><select value={securityType} onChange={(event) => setSecurityType(event.target.value as SecurityType)}><option value="unknown">未知（无法判断）</option><option value="unsecured">无担保（最高 7 年）</option><option value="registered_mortgage">注册不动产抵押（最高 25 年）</option></select></label>
          <label><span>协议条款状态</span><select value={agreementTermsStatus} onChange={(event) => setAgreementTermsStatus(event.target.value as AgreementTermsStatus)}><option value="unknown">未知（无法判断）</option><option value="needs_review">需要人工核对</option><option value="compliant">已核对合规</option><option value="not_compliant">不合规</option></select></label>
          <label><span>协议签署日（DD/MM/YYYY）</span><DateTextInput ariaLabel={`贷款 ${loan.id} 协议签署日`} value={agreementSignedAt} onChange={setAgreementSignedAt} /></label>
          <label><span>协议利率（原始文本）</span><input value={agreementRateText} onChange={(event) => setAgreementRateText(event.target.value)} placeholder="8.77%" /></label>
          <label><span>协议文件 ID（可选）</span><input value={agreementDocumentId} onChange={(event) => setAgreementDocumentId(event.target.value)} inputMode="numeric" /></label>
          <label><span>来源说明</span><input value={sourceDescription} onChange={(event) => setSourceDescription(event.target.value)} /></label>
          <label><span>录入人</span><input value={enteredBy} onChange={(event) => setEnteredBy(event.target.value)} placeholder="姓名或操作员标识" /></label>
          <label><span>录入日期（DD/MM/YYYY）</span><DateTextInput ariaLabel={`贷款 ${loan.id} 期初余额录入日期`} value={enteredAt} onChange={setEnteredAt} /></label>
        </div>
        <div className="div7a-form-actions"><button type="button" className="primary-button" onClick={() => void saveOpeningBalance()}>保存期初余额</button><button type="button" className="secondary-button" onClick={() => void saveAgreement()}>只保存协议资料</button></div>
        <p className="form-message" aria-live="polite">{openingMessage || agreementMessage}</p>
      </details>

      <div className="div7a-repayment-form">
        <label><span>还款日期（DD/MM/YYYY）</span><DateTextInput ariaLabel={`贷款 ${loan.id} 还款日期`} value={date} onChange={setDate} /></label>
        <label><span>金额（AUD）</span><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" /></label>
        <button type="button" className="secondary-button" onClick={() => void addRepayment()}>记录还款</button>
      </div>
      <p className="form-message" aria-live="polite">{message}</p>
    </article>
  );
}
