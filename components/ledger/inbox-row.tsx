"use client";

import { useMemo, useState } from "react";
import { classifyTransaction } from "@/lib/rules/classification";
import { formatCents } from "@/lib/money";
import type { ClosedPeriodInboxItem, Div7aAgreementInboxItem, GstCodeReviewInboxItem, InboxItem, TransactionInboxItem } from "@/lib/ingest/inbox";
import { availableGstCodesForAccountType } from "@/lib/constants/gst";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";

type Props = {
  item: InboxItem;
  entities: Array<{ id: string; name: string }>;
  accounts: Array<{ id: number; entityId: string; code: string; name: string; type: string; defaultGstCode: string }>;
  onUpdated: () => void;
};

function moveFocus(current: HTMLElement, direction: 1 | -1) {
  const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-inbox-row]"));
  const index = rows.indexOf(current);
  rows[(index + direction + rows.length) % rows.length]?.focus();
}

export function InboxRow({ item, entities, accounts, onUpdated }: Props) {
  if (item.kind === "document") {
    return (
      <article className="inbox-row" data-inbox-row tabIndex={0} data-testid={`inbox-document-${item.id}`}>
        <div><span className="inbox-type">文档 · {item.source}</span><strong>{item.filePath}</strong><small>{item.mime} · {item.status}</small></div>
        <button type="button" className="secondary-button" onClick={async () => { await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm_document", documentId: item.id }) }); onUpdated(); }}>标记已查看</button>
      </article>
    );
  }
  if (item.kind === "closed_period_transaction") {
    return <TransactionInboxRow item={item} entities={entities} accounts={accounts} onUpdated={onUpdated} closedPeriod />;
  }
  if (item.kind === "div7a_agreement") {
    return <Div7aAgreementInboxRow item={item} />;
  }
  if (item.kind === "gst_code_review") {
    return <GstCodeReviewRow item={item} onUpdated={onUpdated} />;
  }
  return <TransactionInboxRow item={item} entities={entities} accounts={accounts} onUpdated={onUpdated} />;
}

function Div7aAgreementInboxRow({ item }: { item: Div7aAgreementInboxItem }) {
  const assessment = item.assessmentStatus === "compliant" ? "条款已核对" : item.assessmentStatus === "not_compliant" ? "条款不合规" : "无法判断";
  return <article className="inbox-row div7a-agreement-inbox-row" data-inbox-row tabIndex={0} data-testid={`div7a-agreement-${item.id}`}><div className="inbox-row-main"><span className="inbox-type">Div 7A 协议 · {assessment}</span><strong>{item.entityName} · {item.borrower}</strong><small>{item.periodLabel} · 截止：{item.effectiveDue ? formatDueDate(item.effectiveDue as DateOnly) : "无法判断"} · {item.scopeKey}</small>{item.missingInputs.length ? <small>缺少：{item.missingInputs.join("、")}</small> : null}{item.reasons.length ? <small className="danger-text">警告：{item.reasons.join("；")}</small> : null}</div><a className="secondary-button" href={`/obligations/${item.id}`}>打开协议义务</a></article>;
}

function TransactionInboxRow({ item, entities, accounts, onUpdated, closedPeriod = false }: { item: TransactionInboxItem | ClosedPeriodInboxItem; entities: Props["entities"]; accounts: Props["accounts"]; onUpdated: () => void; closedPeriod?: boolean }) {
  const [entityId, setEntityId] = useState(item.entityId);
  const [accountId, setAccountId] = useState(String(item.accountId));
  const [gstCode, setGstCode] = useState(item.gstCode);
  const [message, setMessage] = useState("");
  const entityAccounts = useMemo(() => accounts.filter((account) => account.entityId === entityId), [accounts, entityId]);
  const selectedAccount = entityAccounts.find((account) => String(account.id) === accountId);
  const availableGstCodes = availableGstCodesForAccountType(selectedAccount?.type ?? "expense");
  const suggestion = classifyTransaction({ description: item.description }, { entityId });

  async function confirm() {
    if (!entityId || !accountId || !gstCode) {
      setMessage("主体、科目和 GST 代码均为必填");
      return;
    }
    const response = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm_transaction", transactionId: item.id, entityId, accountId: Number(accountId), gstCode }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "确认失败"); return; }
    setMessage("已确认");
    onUpdated();
  }

  return (
    <article
      className="inbox-row inbox-transaction-row"
      data-inbox-row
      data-testid={`${closedPeriod ? "closed-period-transaction" : "inbox-transaction"}-${item.id}`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(event.currentTarget, 1); }
        if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(event.currentTarget, -1); }
        if (/^[1-9]$/.test(event.key)) {
          const account = entityAccounts[Number(event.key) - 1];
          if (account) { event.preventDefault(); setAccountId(String(account.id)); }
        }
        if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); void confirm(); }
      }}
    >
      <div className="inbox-row-main"><span className="inbox-type">{closedPeriod ? "已关账期间补录" : "交易 · 待确认"}</span><strong>{item.description}</strong><small>{formatDueDate(item.date as DateOnly)} · {formatCents(item.amountCents)} · 建议：{suggestion.reason}</small>{closedPeriod && item.kind === "closed_period_transaction" ? <small>原底稿：{item.originalPeriodLabel} · worksheet #{item.originalWorksheetId}{item.closedPeriodResolution ? ` · 已标记 ${item.closedPeriodResolution}` : " · 待选择处理方式"}</small> : null}</div>
      <div className="inbox-row-controls">
        <label><span>主体</span><select aria-label="Inbox 主体" value={entityId} onChange={(event) => { setEntityId(event.target.value); setAccountId(""); }}><option value="">请选择</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
        <label><span>科目（数字键 1–9）</span><select aria-label="Inbox 科目" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">请选择</option>{entityAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label><span>GST</span><select aria-label="Inbox GST 代码" value={availableGstCodes.some((code) => code === gstCode) ? gstCode : ""} onChange={(event) => setGstCode(event.target.value as typeof gstCode)}><option value="">请选择</option>{availableGstCodes.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <button type="button" className="primary-button" onClick={() => void confirm()}>确认</button>
        <span className="form-message" aria-live="polite">{message}</span>
      </div>
    </article>
  );
}

function GstCodeReviewRow({ item, onUpdated }: { item: GstCodeReviewInboxItem; onUpdated: () => void }) {
  const [gstCode, setGstCode] = useState<"GST_FREE_INCOME" | "NOT_A_SUPPLY">("GST_FREE_INCOME");
  const [message, setMessage] = useState("");
  async function confirm() {
    const response = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm_transaction", transactionId: item.id, entityId: item.entityId, accountId: item.accountId, gstCode }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "确认失败"); return; }
    setMessage("已重新归类");
    onUpdated();
  }
  return <article className="inbox-row inbox-transaction-row gst-code-review-row" data-inbox-row tabIndex={0} data-testid={`gst-code-review-${item.id}`}>
    <div className="inbox-row-main"><span className="inbox-type">GST 代码复核 · 必须人工重选</span><strong>{item.description}</strong><small>{formatDueDate(item.date as DateOnly)} · {formatCents(item.amountCents)} · 当前代码：NO_GST</small><p>{item.explanation}</p></div>
    <div className="inbox-row-controls"><label><span>重新选择</span><select aria-label="GST 代码复核选择" value={gstCode} onChange={(event) => setGstCode(event.target.value as typeof gstCode)}><option value="GST_FREE_INCOME">GST_FREE_INCOME · 仍是销售</option><option value="NOT_A_SUPPLY">NOT_A_SUPPLY · 不是销售</option></select></label><button type="button" className="primary-button" onClick={() => void confirm()}>保存人工选择</button><span className="form-message" aria-live="polite">{message}</span></div>
  </article>;
}
