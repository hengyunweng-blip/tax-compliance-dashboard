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

  return (
    <main className="ledger-shell">
      <aside className="app-rail" aria-label="主导航"><div className="brand-lockup"><span>税务合规看板</span></div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/upload">上传</a><a className="nav-item" href="/import">CSV 导入</a><a className="nav-item active" href="/inbox">Inbox</a><a className="nav-item" href="/settings">设置</a></nav></aside>
      <section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 2 · 人工确认</p><h1>Inbox</h1><p>低置信度交易和未确认文档集中处理；确认前不会进入 BAS 候选。</p></div><span className="inbox-count">待处理 {items.length} 项</span></header>
        <QuickEntryForm entities={entities} accounts={accounts} onCreated={load} />
        <section className="inbox-list" aria-label="待确认项目" data-testid="inbox-list">
          {items.length ? items.map((item) => <InboxRow key={`${item.kind}-${item.id}`} item={item} entities={entities} accounts={accounts} onUpdated={load} />) : <p className="empty-state">当前没有待确认项目。</p>}
        </section>
        <p className="form-message" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
