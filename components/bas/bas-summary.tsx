"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";
import type { BasGenerationResult, BasLineItem, BasWorksheetRecord } from "@/lib/domain/bas/generator";
import { BasInstructions } from "@/components/bas/bas-instructions";

type ObligationProps = {
  id: number;
  entityName: string;
  periodLabel: string;
  incomeYear: string;
  statutoryDue: DateOnly | null;
  effectiveDue: DateOnly | null;
  status: string;
};

type Props = {
  obligation: ObligationProps;
  initialWorksheet: BasWorksheetRecord | null;
};

function displayYear(value: string) {
  return value.replace("-", "–");
}

function SummaryValue({ label, cents }: { label: string; cents: number }) {
  return <div className="bas-value-card"><span>{label}</span><strong>{formatCents(cents)}</strong></div>;
}

function LineItem({ line }: { line: BasLineItem }) {
  return (
    <tr data-testid="bas-line-item">
      <td>交易 #{line.transactionId}</td>
      <td>{formatDueDate(line.date)}</td>
      <td>{line.description}</td>
      <td>{line.gstCode}</td>
      <td className="amount-cell">{formatCents(line.amountCents)}</td>
    </tr>
  );
}

export function BasSummary({ obligation, initialWorksheet }: Props) {
  const [worksheet, setWorksheet] = useState(initialWorksheet);
  const [status, setStatus] = useState(obligation.status);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [noPayg, setNoPayg] = useState(initialWorksheet?.payg5aCents === 0 && initialWorksheet?.payg5bCents === 0);
  const [payg5aInput, setPayg5aInput] = useState(initialWorksheet?.payg5aCents === null || initialWorksheet?.payg5aCents === undefined ? "" : String(initialWorksheet.payg5aCents));
  const [payg5bInput, setPayg5bInput] = useState(initialWorksheet?.payg5bCents === null || initialWorksheet?.payg5bCents === undefined ? "" : String(initialWorksheet.payg5bCents));
  const [receiptNumber, setReceiptNumber] = useState("");
  const [lodgedInput, setLodgedInput] = useState(initialWorksheet?.statementTotalCents === null || initialWorksheet?.statementTotalCents === undefined ? "" : String(initialWorksheet.statementTotalCents));

  async function callApi(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/bas/${obligation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { worksheet?: BasWorksheetRecord; result?: BasGenerationResult; obligation?: { status: string }; error?: string; warnings?: string[] };
    setBusy(false);
    if (!response.ok) {
      setMessage([payload.error, ...(payload.warnings ?? [])].filter(Boolean).join("；") || "BAS 操作失败");
      return null;
    }
    const nextWorksheet = payload.worksheet ?? payload.result?.worksheet ?? null;
    if (nextWorksheet) setWorksheet(nextWorksheet);
    if (payload.obligation?.status) setStatus(payload.obligation.status);
    return payload;
  }

  async function generate() {
    const payload = await callApi({ action: "generate" });
    if (payload) {
      setMessage("BAS 底稿已生成，纳入交易已锁定");
      window.history.replaceState(null, "", `/bas/${obligation.id}`);
    }
  }

  async function savePayg() {
    if (!noPayg && !/^[-+]?\d+$/.test(payg5aInput.trim())) {
      setMessage("PAYG 5A 必须填写整数分；若本期没有 PAYG，请勾选无 PAYG 分期");
      return;
    }
    if (!noPayg && payg5bInput.trim() && !/^[-+]?\d+$/.test(payg5bInput.trim())) {
      setMessage("PAYG 5B 必须填写整数分");
      return;
    }
    const payg5aCents = noPayg ? 0 : Number(payg5aInput);
    const payg5bCents = noPayg || !payg5bInput.trim() ? 0 : Number(payg5bInput);
    if (!Number.isSafeInteger(payg5aCents) || !Number.isSafeInteger(payg5bCents)) {
      setMessage("PAYG 5A/5B 必须是安全范围内的整数分");
      return;
    }
    const payload = await callApi({ action: "payg", payg5aCents, payg5bCents });
    if (payload) {
      const saved = payload.worksheet as BasWorksheetRecord;
      setPayg5aInput(String(saved.payg5aCents ?? ""));
      setPayg5bInput(String(saved.payg5bCents ?? ""));
      setNoPayg(saved.payg5aCents === 0 && saved.payg5bCents === 0);
      setLodgedInput(String(saved.statementTotalCents ?? ""));
      setMessage(noPayg ? "已确认本期无 PAYG 分期，已重新计算 statementTotalCents" : "ATO 预填 PAYG 5A/5B 已保存，已重新计算 statementTotalCents");
    }
  }

  async function lodge() {
    if (!receiptNumber.trim() || !/^[-+]?\d+$/.test(lodgedInput.trim())) {
      setMessage("ATO 回执号和已递交整数分金额均为必填");
      return;
    }
    const payload = await callApi({ action: "lodge", receiptNumber, lodgedAmountCents: Number(lodgedInput) });
    if (payload) setMessage("已记录 ATO 回执，金额已按 statementTotalCents 校验");
  }

  return (
    <main className="bas-shell" data-testid="bas-page">
      <header className="bas-header">
        <a className="back-link" href="/">← 返回看板</a>
        <span className="detail-status">{status}</span>
      </header>
      <section className="bas-panel">
        <p className="page-kicker">{obligation.entityName} · {obligation.periodLabel}</p>
        <h1>{displayYear(obligation.incomeYear)} BAS 底稿{obligation.statutoryDue ? ` · 截止 ${formatDueDate(obligation.statutoryDue)}` : ""}</h1>
        <p className="bas-due-note">实际工作日：{obligation.effectiveDue ? formatDueDate(obligation.effectiveDue) : "待配置"}</p>
        {!worksheet ? (
          <section className="bas-generate-card">
            <h2>生成本期底稿</h2>
            <p>系统只纳入已确认、未锁定且属于本主体/财年/季度的交易；待确认交易会阻止生成。</p>
            <button type="button" className="primary-button" onClick={() => void generate()} disabled={busy}>{busy ? "生成中…" : "生成 BAS 底稿"}</button>
          </section>
        ) : (
          <>
            <section className="bas-summary-grid" aria-label="BAS 对外申报汇总">
              <SummaryValue label="G1" cents={worksheet.g1Cents} />
              <SummaryValue label="1A" cents={worksheet.a1Cents} />
              <SummaryValue label="1B" cents={worksheet.b1Cents} />
              <SummaryValue label="GST net = 1A - 1B" cents={worksheet.gstNetCents} />
            </section>
            <section className="bas-internal-summary" data-testid="bas-internal-summary" aria-label="BAS 内部核算">
              <h2>内部核算</h2>
              <div className="bas-summary-grid">
                <SummaryValue label="G10（内部核算用，不填入 ATO 表单）" cents={worksheet.g10Cents} />
                <SummaryValue label="G11（内部核算用，不填入 ATO 表单）" cents={worksheet.g11Cents} />
              </div>
            </section>
            <section className="bas-payg-panel" aria-label="PAYG 分期预缴">
              <h2>PAYG instalment（5A/5B，ATO 预填，整数分）</h2>
              <p>系统不推算 PAYG；请根据 ATO 预填数字手动录入。若本期没有 PAYG 分期，勾选下方选项，系统会写入 5A=0、5B=0。</p>
              <label className="bas-checkbox"><input aria-label="本期无 PAYG 分期" type="checkbox" checked={noPayg} onChange={(event) => setNoPayg(event.target.checked)} /><span>本期无 PAYG 分期（5A=0，5B=0）</span></label>
              <div className="bas-action-row">
                <label><span>payg5aCents（5A 应缴）</span><input aria-label="payg5aCents" inputMode="numeric" disabled={noPayg} value={payg5aInput} onChange={(event) => setPayg5aInput(event.target.value)} /></label>
                <label><span>payg5bCents（5B 贷记）</span><input aria-label="payg5bCents" inputMode="numeric" disabled={noPayg} value={payg5bInput} onChange={(event) => setPayg5bInput(event.target.value)} /></label>
                <button type="button" className="secondary-button" onClick={() => void savePayg()} disabled={busy}>保存 PAYG</button>
              </div>
              <div className="bas-total-row"><span>statementTotalCents = gstNetCents + payg5aCents - payg5bCents</span><strong>{worksheet.statementTotalCents === null ? "待确认 PAYG" : `${worksheet.statementType === "refund" ? "退税" : "应缴"} ${formatCents(worksheet.statementTotalCents)}`}</strong></div>
            </section>
            <BasInstructions isNil={worksheet.isNil} />
            <details className="bas-lines" open>
              <summary>交易明细（{worksheet.lines.length} 条，含交易 ID 可追溯）</summary>
              {worksheet.lines.length ? <div className="bas-table-wrap"><table><thead><tr><th>交易</th><th>日期</th><th>描述</th><th>GST</th><th>金额</th></tr></thead><tbody>{worksheet.lines.map((line) => <LineItem key={line.transactionId} line={line} />)}</tbody></table></div> : <p className="bas-nil-note">无已确认交易，本期为 nil BAS。</p>}
            </details>
            <section className="bas-lodge-panel" aria-label="记录已递交">
              <h2>记录已递交</h2>
              {worksheet.statementTotalCents === null ? <p>请录入 5A/5B，或确认本期无 PAYG 分期，系统才会开放已递交金额校验。</p> : status === "lodged" || status === "paid" ? <p>已记录 ATO 回执，当前状态：{status}。</p> : <div className="bas-action-row"><label><span>ATO 回执号</span><input aria-label="ATO 回执号" value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} /></label><label><span>已递交金额（整数分）</span><input aria-label="已递交金额（整数分）" inputMode="numeric" value={lodgedInput} onChange={(event) => setLodgedInput(event.target.value)} /></label><button type="button" className="primary-button" onClick={() => void lodge()} disabled={busy}>标记已递交</button></div>}
            </section>
            <div className="bas-export-links"><a href={`/api/bas/${obligation.id}?format=csv`}>导出 CSV</a><a href={`/api/bas/${obligation.id}?format=pdf`}>导出 PDF</a></div>
          </>
        )}
        <p className="form-message" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
