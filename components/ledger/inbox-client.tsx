"use client";

import { useCallback, useEffect, useState } from "react";
import { InboxRow } from "@/components/ledger/inbox-row";
import { QuickEntryForm } from "@/components/ledger/quick-entry-form";
import type { InboxItem } from "@/lib/ingest/inbox";

type Props = {
  entities: Array<{ id: string; name: string }>;
  accounts: Array<{ id: number; entityId: string; code: string; name: string; defaultGstCode: string }>;
};

export function InboxClient({ entities, accounts }: Props) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/inbox");
    const payload = await response.json() as { items?: InboxItem[]; error?: string };
    if (!response.ok) { setMessage(payload.error ?? "Inbox 加载失败"); return; }
    setItems(payload.items ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const closedPeriodItems = items.filter((item) => item.kind === "closed_period_transaction");
  const ordinaryItems = items.filter((item) => item.kind !== "closed_period_transaction");

  return (
    <main className="ledger-shell">
      <aside className="app-rail" aria-label="主导航"><div className="brand-lockup"><span>税务合规看板</span></div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/upload">上传</a><a className="nav-item" href="/import">CSV 导入</a><a className="nav-item active" href="/inbox">Inbox</a><a className="nav-item" href="/news">资讯</a><a className="nav-item" href="/settings">设置</a></nav></aside>
      <section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 4 · 关账保护</p><h1>Inbox</h1><p>普通待确认项目与已关账期间补录分开处理；关账期间交易不会静默进入或遗漏 BAS。</p></div><span className="inbox-count">待处理 {items.length} 项</span></header>
        <QuickEntryForm entities={entities} accounts={accounts} onCreated={load} />
        <section className="inbox-section closed-period-inbox-section" aria-label="已关账期间补录" data-testid="closed-period-inbox">
          <div className="inbox-section-heading"><div><p className="page-kicker">安全阀</p><h2>已关账期间补录</h2><p>这些交易命中已递交或已缴款 BAS 的期间，必须在后续 BAS 中明确处理。</p></div><span>{closedPeriodItems.length} 项</span></div>
          {closedPeriodItems.length ? closedPeriodItems.map((item) => <InboxRow key={`${item.kind}-${item.id}`} item={item} entities={entities} accounts={accounts} onUpdated={load} />) : <p className="empty-state">当前没有已关账期间补录。</p>}
        </section>
        <section className="inbox-section" aria-label="普通待确认" data-testid="ordinary-inbox">
          <div className="inbox-section-heading"><div><p className="page-kicker">人工确认</p><h2>普通待确认</h2></div><span>{ordinaryItems.length} 项</span></div>
          {ordinaryItems.length ? ordinaryItems.map((item) => <InboxRow key={`${item.kind}-${item.id}`} item={item} entities={entities} accounts={accounts} onUpdated={load} />) : <p className="empty-state">当前没有普通待确认项目。</p>}
        </section>
        <p className="form-message" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
