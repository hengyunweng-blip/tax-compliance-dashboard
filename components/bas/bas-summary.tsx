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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paygInput, setPaygInput] = useState(initialWorksheet?.paygInstalmentCents === null || initialWorksheet?.paygInstalmentCents === undefined ? "" : String(initialWorksheet.paygInstalmentCents));
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
    if (!/^[-+]?\d+$/.test(paygInput.trim())) {
      setMessage("PAYG instalment 必须填写整数分");
      return;
    }
    const payload = await callApi({ action: "payg", paygInstalmentCents: Number(paygInput) });
    if (payload) {
      setLodgedInput(String((payload.worksheet as BasWorksheetRecord).statementTotalCents ?? ""));
      setMessage("ATO 预填 PAYG 已保存，已重新计算 statementTotalCents");
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
        <span className="detail-status">{obligation.status}</span>
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
              <h2>PAYG instalment（ATO 预填，整数分）</h2>
              <p>系统不推算 5A/5B；请根据 ATO 预填数字手动录入。已录入后才会产生 statementTotalCents。</p>
              <div className="bas-action-row">
                <label><span>paygInstalmentCents</span><input aria-label="paygInstalmentCents" inputMode="numeric" value={paygInput} onChange={(event) => setPaygInput(event.target.value)} /></label>
                <button type="button" className="secondary-button" onClick={() => void savePayg()} disabled={busy}>保存 PAYG</button>
              </div>
              <div className="bas-total-row"><span>statementTotalCents = gstNetCents + paygInstalmentCents</span><strong>{worksheet.statementTotalCents === null ? "待录入 PAYG" : formatCents(worksheet.statementTotalCents)}</strong></div>
            </section>
            <BasInstructions isNil={worksheet.isNil} />
            <details className="bas-lines" open>
              <summary>交易明细（{worksheet.lines.length} 条，含交易 ID 可追溯）</summary>
              {worksheet.lines.length ? <div className="bas-table-wrap"><table><thead><tr><th>交易</th><th>日期</th><th>描述</th><th>GST</th><th>金额</th></tr></thead><tbody>{worksheet.lines.map((line) => <LineItem key={line.transactionId} line={line} />)}</tbody></table></div> : <p className="bas-nil-note">无已确认交易，本期为 nil BAS。</p>}
            </details>
            <section className="bas-lodge-panel" aria-label="记录已递交">
              <h2>记录已递交</h2>
              {worksheet.statementTotalCents === null ? <p>先录入 PAYG，系统才会开放已递交金额校验。</p> : <div className="bas-action-row"><label><span>ATO 回执号</span><input aria-label="ATO 回执号" value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} /></label><label><span>已递交金额（整数分）</span><input aria-label="已递交金额（整数分）" inputMode="numeric" value={lodgedInput} onChange={(event) => setLodgedInput(event.target.value)} /></label><button type="button" className="primary-button" onClick={() => void lodge()} disabled={busy}>标记已递交</button></div>}
            </section>
            <div className="bas-export-links"><a href={`/api/bas/${obligation.id}?format=csv`}>导出 CSV</a><a href={`/api/bas/${obligation.id}?format=pdf`}>导出 PDF</a></div>
          </>
        )}
        <p className="form-message" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
