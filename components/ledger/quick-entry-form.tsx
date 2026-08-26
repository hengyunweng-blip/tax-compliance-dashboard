"use client";

import { useState } from "react";
import { DateTextInput } from "@/components/date-text-input";
import type { DateOnly } from "@/lib/time/melbourne";

type Props = {
  entities: Array<{ id: string; name: string }>;
  accounts: Array<{ id: number; entityId: string; code: string; name: string; defaultGstCode: string }>;
  onCreated: () => void;
};

export function QuickEntryForm({ entities, accounts, onCreated }: Props) {
  const [entityId, setEntityId] = useState(entities.find((entity) => entity.id === "boyun_co")?.id ?? entities[0]?.id ?? "");
  const [date, setDate] = useState<DateOnly | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [gstCode, setGstCode] = useState("GST_EXPENSE");
  const [message, setMessage] = useState("");
  const entityAccounts = accounts.filter((account) => account.entityId === entityId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!entityId || !date || !description.trim() || !amount.trim() || !accountId || !gstCode) {
      setMessage("主体、日期、描述、金额、科目和 GST 代码均为必填");
      return;
    }
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, date, description, amount, gst: "0", accountId: Number(accountId), gstCode, source: "manual", reviewFlag: false }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "保存失败"); return; }
    setMessage("已保存");
    setDescription("");
    setAmount("");
    onCreated();
  }

  return (
    <form className="quick-entry-card" data-testid="quick-entry" onSubmit={submit}>
      <div className="ledger-card-heading"><div><p className="page-kicker">手动入口</p><h2>快速录入</h2><p>日期固定使用 DD/MM/YYYY；金额在 API 边界按字符串解析为整数分。</p></div></div>
      <div className="ledger-form-grid">
        <label><span>主体</span><select value={entityId} onChange={(event) => { setEntityId(event.target.value); setAccountId(""); }}><option value="">请选择</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
        <label><span>日期</span><DateTextInput ariaLabel="快速录入日期" value={date} onChange={setDate} /></label>
        <label><span>描述</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label><span>金额（AUD）</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
        <label><span>科目</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">请选择</option>{entityAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label><span>GST 代码</span><select value={gstCode} onChange={(event) => setGstCode(event.target.value)}>{["GST_INCOME", "GST_FREE_INCOME", "INPUT_TAXED", "GST_EXPENSE", "GST_CAPITAL", "NO_GST", "PRIVATE"].map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
      </div>
      <button type="submit" className="primary-button">保存交易</button><p className="form-message" aria-live="polite">{message}</p>
    </form>
  );
}
