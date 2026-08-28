"use client";

import { useState } from "react";
import { BackupControls } from "@/components/annual/backup-controls";
import { DateTextInput } from "@/components/date-text-input";
import { formatCents } from "@/lib/money";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";
import type { SuperProgress } from "@/lib/domain/super/service";

type Person = { id: string; name: string };

export function SuperPageClient({ people, initialProgress }: { people: Person[]; initialProgress: SuperProgress[] }) {
  const [selectedPerson, setSelectedPerson] = useState(people[0]?.id ?? "self");
  const [progress, setProgress] = useState(initialProgress);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState<DateOnly | null>(null);
  const [noticeDate, setNoticeDate] = useState<DateOnly | null>(null);
  const [message, setMessage] = useState("");
  const current = progress.find((item) => item.person === selectedPerson) ?? progress[0];
  const personName = people.find((person) => person.id === selectedPerson)?.name ?? selectedPerson;

  async function refresh(person = selectedPerson) {
    const response = await fetch(`/api/super?person=${encodeURIComponent(person)}&fy=2026-27`);
    const payload = await response.json() as { progress?: SuperProgress };
    const nextProgress = payload.progress;
    if (response.ok && nextProgress) setProgress((items) => items.some((item) => item.person === person) ? items.map((item) => item.person === person ? nextProgress : item) : [...items, nextProgress]);
  }

  async function saveContribution() {
    if (!amount.trim()) { setMessage("请填写供款金额"); return; }
    const response = await fetch("/api/super", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "contribution", person: selectedPerson, fy: "2026-27", amount, paidAt }) });
    const payload = await response.json() as { progress?: SuperProgress; error?: string };
    if (!response.ok) { setMessage(payload.error ?? "供款保存失败"); return; }
    if (payload.progress) setProgress((items) => items.map((item) => item.person === selectedPerson ? payload.progress as SuperProgress : item));
    setAmount(""); setPaidAt(null); setMessage("供款到账已记录；抵扣意向通知仍保持独立状态");
  }

  async function saveNotice() {
    if (!noticeDate) { setMessage("请填写通知提交日期"); return; }
    const response = await fetch("/api/super", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "notice", person: selectedPerson, fy: "2026-27", submittedAt: noticeDate }) });
    const payload = await response.json() as { progress?: SuperProgress; error?: string };
    if (!response.ok) { setMessage(payload.error ?? "通知保存失败"); return; }
    if (payload.progress) setProgress((items) => items.map((item) => item.person === selectedPerson ? payload.progress as SuperProgress : item));
    setNoticeDate(null); setMessage("抵扣意向通知已单独记录；供款到账状态不受影响");
  }

  return <main className="ledger-shell" data-testid="super-page"><aside className="app-rail"><div className="brand-lockup">税务合规看板</div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/annual">年度底稿</a><a className="nav-item" href="/div7a">Div 7A</a><a className="nav-item active" href="/super">养老金</a><a className="nav-item" href="/settings">设置</a></nav></aside><section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 5 · 个人养老金</p><h1>养老金</h1><p>供款到账与抵扣意向通知是两个独立待办；系统只记录用户输入，不推算 PAYG 或追补额度。</p></div><div className="annual-person-switch"><label><span>个人</span><select value={selectedPerson} onChange={(event) => { setSelectedPerson(event.target.value); void refresh(event.target.value); }}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div></header>{current ? <><section className="super-overview" data-testid="super-progress"><div className="annual-card-heading"><div><p className="page-kicker">{personName} · {current.incomeYear.replace("-", "–")}</p><h2>供款进度</h2></div><span>{current.capConfigured ? "上限已配置" : "上限未配置"}</span></div><div className="annual-metric-grid"><div><span>已到账供款</span><strong>{formatCents(current.contributedCents)}</strong></div><div><span>年度上限</span><strong>{current.capCents === null ? "未配置" : formatCents(current.capCents)}</strong></div><div><span>非应税上限</span><strong>{current.nonConcessionalCapCents === null ? "未配置" : formatCents(current.nonConcessionalCapCents)}</strong></div><div><span>剩余额度</span><strong>{current.remainingCents === null ? "未配置" : formatCents(current.remainingCents)}</strong></div><div><span>通知状态</span><strong>{current.noticeComplete ? "已提交" : "待处理"}</strong></div></div><p className="super-source">concessional 上限来源：{current.capSourceUrl ? <a href={current.capSourceUrl} target="_blank" rel="noreferrer">ATO 官方页面</a> : "未配置"} · 取数日期：{current.capRetrievedAt ?? "未配置"}</p><p className="super-source">non-concessional 上限来源：{current.nonConcessionalCapSourceUrl ? <a href={current.nonConcessionalCapSourceUrl} target="_blank" rel="noreferrer">ATO 官方页面</a> : "未配置"} · 取数日期：{current.nonConcessionalCapRetrievedAt ?? "未配置"}</p><p className="super-source">追补规则：{current.carryForwardHint} {current.carryForwardSourceUrl ? <a href={current.carryForwardSourceUrl} target="_blank" rel="noreferrer">来源</a> : null} · 取数日期：{current.carryForwardRetrievedAt ?? "未配置"}</p></section><section className="super-task-grid"><article className={current.paymentComplete ? "super-task complete" : "super-task"}><h2>1 · 供款到账</h2><p>{current.paymentComplete ? "已记录到账" : "必须在截止日前到账；使用 backward 方向，不能推入下一财年。"}</p><div className="super-form"><label><span>金额（AUD）</span><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" /></label><label><span>到账日（DD/MM/YYYY）</span><DateTextInput ariaLabel="供款到账日" value={paidAt} onChange={setPaidAt} /></label><button type="button" className="primary-button" onClick={() => void saveContribution()}>记录到账</button></div></article><article className={current.noticeComplete ? "super-task complete" : "super-task"}><h2>2 · 抵扣意向通知</h2><p>{current.noticeComplete ? `已提交：${current.noticeSubmittedAt ? formatDueDate(current.noticeSubmittedAt) : "已记录"}` : "完成供款不会自动关闭；必须单独提交并记录基金确认。"}</p><div className="super-form"><label><span>提交日（DD/MM/YYYY）</span><DateTextInput ariaLabel="抵扣意向通知提交日" value={noticeDate} onChange={setNoticeDate} /></label><button type="button" className="secondary-button" onClick={() => void saveNotice()}>记录通知</button></div></article></section></> : <p className="empty-state">暂无个人主体。</p>}<p className="form-message" aria-live="polite">{message}</p><BackupControls /></section></main>;
}
