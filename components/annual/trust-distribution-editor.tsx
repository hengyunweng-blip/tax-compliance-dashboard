"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateTextInput } from "@/components/date-text-input";
import { formatCents } from "@/lib/money";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";
import type { TrustDistributionDraft } from "@/lib/domain/annual/trust";

type Props = { draft: TrustDistributionDraft; onSaved?: () => void };

export function TrustDistributionEditor({ draft, onSaved }: Props) {
  const router = useRouter();
  const [beneficiaryEntityId, setBeneficiaryEntityId] = useState<"self" | "spouse">("self");
  const [amount, setAmount] = useState("");
  const [resolutionDate, setResolutionDate] = useState<DateOnly | null>(null);
  const [status, setStatus] = useState<"proposed" | "signed">("proposed");
  const [sourceDescription, setSourceDescription] = useState("");
  const [enteredBy, setEnteredBy] = useState("self");
  const [explanation, setExplanation] = useState("");
  const [message, setMessage] = useState("");

  async function saveDistribution() {
    if (!amount.trim() || !resolutionDate || !sourceDescription.trim() || !enteredBy.trim()) {
      setMessage("受益人、金额、决议日、来源说明和录入人均为必填");
      return;
    }
    const response = await fetch("/api/annual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trust_distribution", trustEntityId: draft.entityId, incomeYear: draft.incomeYear, beneficiaryEntityId, amount, resolutionDate, status, sourceDescription, enteredBy }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "分配保存失败"); return; }
    setAmount(""); setResolutionDate(null); setSourceDescription(""); setMessage("分配已保存，个人底稿将自动更新"); onSaved?.(); router.refresh();
  }

  async function confirmDifference() {
    if (!explanation.trim()) { setMessage("分配差额必须填写说明"); return; }
    const response = await fetch("/api/annual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm_trust_distribution_difference", trustEntityId: draft.entityId, incomeYear: draft.incomeYear, explanation, enteredBy }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "差额确认失败"); return; }
    setMessage("分配差额说明已写入审计记录"); onSaved?.(); router.refresh();
  }

  return <section className="trust-distribution-editor" aria-label="信托受益人分配录入">
    <h3>受益人分配录入（仅限 self / spouse）</h3>
    {draft.beneficiaryAllocations.length ? <ul className="distribution-list">{draft.beneficiaryAllocations.map((allocation) => <li key={allocation.beneficiaryEntityId}><span>{allocation.beneficiaryName} · {formatCents(allocation.amountCents)} · {allocation.statusLabel}</span><small>决议日：{formatDueDate(allocation.resolutionDate)}</small></li>)}</ul> : <p className="empty-state">尚未录入分配。</p>}
    <div className="ledger-form-grid">
      <label><span>受益人</span><select value={beneficiaryEntityId} onChange={(event) => setBeneficiaryEntityId(event.target.value as "self" | "spouse")}><option value="self">self</option><option value="spouse">spouse</option></select></label>
      <label><span>金额（AUD）</span><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" /></label>
      <label><span>决议日（DD/MM/YYYY）</span><DateTextInput ariaLabel="信托分配决议日" value={resolutionDate} onChange={setResolutionDate} /></label>
      <label><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value as "proposed" | "signed")}><option value="proposed">拟议·未签署</option><option value="signed">已签署</option></select></label>
      <label><span>来源说明</span><input value={sourceDescription} onChange={(event) => setSourceDescription(event.target.value)} placeholder="例如：FY 年度分配决议" /></label>
      <label><span>录入人</span><input value={enteredBy} onChange={(event) => setEnteredBy(event.target.value)} /></label>
    </div>
    <button type="button" className="primary-button" onClick={() => void saveDistribution()}>保存分配</button>
    {draft.distributionDifferenceCents !== null && draft.distributionDifferenceCents !== 0 ? <div className="distribution-difference danger-text"><p>分配合计与信托可分配收入差额：{formatCents(draft.distributionDifferenceCents)}，系统不会自动配平。</p><label><span>差额说明</span><textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label><button type="button" className="secondary-button" onClick={() => void confirmDifference()}>确认差额并写入审计</button></div> : null}
    <p className="form-message" aria-live="polite">{message}</p>
  </section>;
}
