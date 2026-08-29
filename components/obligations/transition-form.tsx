"use client";

import { useState } from "react";
import type { ObligationStatus } from "@/lib/domain/obligations/rules";
import { DateTextInput } from "@/components/date-text-input";
import type { DateOnly } from "@/lib/time/melbourne";

const STATUS_OPTIONS: Array<{ value: ObligationStatus; label: string }> = [
  { value: "todo", label: "待处理" },
  { value: "collecting", label: "录入中" },
  { value: "draft_ready", label: "底稿就绪" },
  { value: "lodged", label: "已递交" },
  { value: "paid", label: "已缴款" },
  { value: "na", label: "不适用" },
];

export function TransitionForm({ obligationId, status }: { obligationId: number; status: ObligationStatus }) {
  const [to, setTo] = useState<ObligationStatus>(status === "blocked" ? "todo" : "collecting");
  const [reason, setReason] = useState("");
  const [lodgedAt, setLodgedAt] = useState<DateOnly | null>(null);
  const [paidAt, setPaidAt] = useState<DateOnly | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (to === "lodged" && !lodgedAt) {
      setMessage("实际递交日期为必填");
      return;
    }
    if (to === "paid" && !paidAt) {
      setMessage("实际缴款日期为必填");
      return;
    }
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/obligations/${obligationId}/transition`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, reason, ...(to === "lodged" ? { lodgedAt } : {}), ...(to === "paid" ? { paidAt } : {}) }),
    });
    const payload = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "状态更新失败");
      return;
    }
    setMessage("状态已保存");
    window.location.reload();
  }

  return (
    <section className="detail-transition" aria-label="更新义务状态">
      <h2>更新状态</h2>
      <div className="detail-transition-fields">
        <label>
          <span>新状态</span>
          <select value={to} onChange={(event) => setTo(event.target.value as ObligationStatus)}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>变更原因</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：已完成复核" />
        </label>
        {to === "lodged" ? <label><span>实际递交日期（DD/MM/YYYY）</span><DateTextInput ariaLabel="实际递交日期" value={lodgedAt} onChange={setLodgedAt} /></label> : null}
        {to === "paid" ? <label><span>实际缴款日期（DD/MM/YYYY）</span><DateTextInput ariaLabel="实际缴款日期" value={paidAt} onChange={setPaidAt} /></label> : null}
        <button type="button" className="primary-button" onClick={submit} disabled={saving || !reason.trim() || (to === "lodged" && !lodgedAt) || (to === "paid" && !paidAt)}>
          {saving ? "保存中…" : "保存状态"}
        </button>
      </div>
      <p className="save-message" aria-live="polite">{message}</p>
    </section>
  );
}
