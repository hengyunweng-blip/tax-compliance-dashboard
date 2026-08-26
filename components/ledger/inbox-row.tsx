"use client";

import { useMemo, useState } from "react";
import { classifyTransaction } from "@/lib/rules/classification";
import { formatCents } from "@/lib/money";
import type { InboxItem, TransactionInboxItem } from "@/lib/ingest/inbox";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";

type Props = {
  item: InboxItem;
  entities: Array<{ id: string; name: string }>;
  accounts: Array<{ id: number; entityId: string; code: string; name: string; defaultGstCode: string }>;
  onUpdated: () => void;
};

const GST_CODES = ["GST_INCOME", "GST_FREE_INCOME", "INPUT_TAXED", "GST_EXPENSE", "GST_CAPITAL", "NO_GST", "PRIVATE"] as const;

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
  return <TransactionInboxRow item={item} entities={entities} accounts={accounts} onUpdated={onUpdated} />;
}

function TransactionInboxRow({ item, entities, accounts, onUpdated }: { item: TransactionInboxItem; entities: Props["entities"]; accounts: Props["accounts"]; onUpdated: () => void }) {
  const [entityId, setEntityId] = useState(item.entityId);
  const [accountId, setAccountId] = useState(String(item.accountId));
  const [gstCode, setGstCode] = useState(item.gstCode);
  const [message, setMessage] = useState("");
  const entityAccounts = useMemo(() => accounts.filter((account) => account.entityId === entityId), [accounts, entityId]);
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
      data-testid={`inbox-transaction-${item.id}`}
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
      <div className="inbox-row-main"><span className="inbox-type">交易 · 待确认</span><strong>{item.description}</strong><small>{formatDueDate(item.date as DateOnly)} · {formatCents(item.amountCents)} · 建议：{suggestion.reason}</small></div>
      <div className="inbox-row-controls">
        <label><span>主体</span><select aria-label="Inbox 主体" value={entityId} onChange={(event) => { setEntityId(event.target.value); setAccountId(""); }}><option value="">请选择</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
        <label><span>科目（数字键 1–9）</span><select aria-label="Inbox 科目" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">请选择</option>{entityAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label><span>GST</span><select aria-label="Inbox GST 代码" value={gstCode} onChange={(event) => setGstCode(event.target.value as typeof gstCode)}><option value="">请选择</option>{GST_CODES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <button type="button" className="primary-button" onClick={() => void confirm()}>确认</button>
        <span className="form-message" aria-live="polite">{message}</span>
      </div>
    </article>
  );
}
