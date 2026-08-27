"use client";

import { useState } from "react";
import { NewsCard } from "@/components/news/news-card";
import type { NewsFeedItem } from "@/lib/news/analysis";
import type { NewsSource } from "@/lib/news/sources";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";

type Props = {
  initialItems: NewsFeedItem[];
  initialExcludedItems: NewsFeedItem[];
  initialUndatedItems: NewsFeedItem[];
  initialSources: NewsSource[];
  initialWindowDays: number;
  aiEnabled: boolean;
  aiStatus: string;
};

export function NewsPageClient({ initialItems, initialExcludedItems, initialUndatedItems, initialSources, initialWindowDays, aiEnabled, aiStatus }: Props) {
  const [items, setItems] = useState(initialItems);
  const [excludedItems, setExcludedItems] = useState(initialExcludedItems);
  const [undatedItems, setUndatedItems] = useState(initialUndatedItems);
  const [sources, setSources] = useState(initialSources);
  const [windowDays, setWindowDays] = useState(initialWindowDays);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    const response = await fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
    setBusy(false);
    setMessage(response.ok ? "资讯后台刷新已启动，首屏不等待外部来源。" : "资讯刷新未启动");
  }

  async function dismiss(id: number) {
    const response = await fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss", newsItemId: id }) });
    if (!response.ok) { setMessage("忽略资讯失败"); return; }
    const payload = await response.json() as { items: NewsFeedItem[]; excludedItems?: NewsFeedItem[]; undatedItems?: NewsFeedItem[]; sources: NewsSource[]; windowDays?: number };
    setItems(payload.items);
    setExcludedItems(payload.excludedItems ?? []);
    setUndatedItems(payload.undatedItems ?? []);
    setSources(payload.sources);
    if (payload.windowDays) setWindowDays(payload.windowDays);
    setMessage("已忽略，原文记录仍保留。");
  }

  async function createTodo(analysisId: number) {
    if (confirming !== analysisId) {
      setConfirming(analysisId);
      return;
    }
    const response = await fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_todo", newsAnalysisId: analysisId, confirmed: true }) });
    const payload = await response.json() as { items?: NewsFeedItem[]; excludedItems?: NewsFeedItem[]; undatedItems?: NewsFeedItem[]; sources?: NewsSource[]; windowDays?: number; error?: string };
    if (!response.ok) { setMessage(payload.error ?? "待办创建失败"); return; }
    setItems(payload.items ?? items);
    setExcludedItems(payload.excludedItems ?? excludedItems);
    setUndatedItems(payload.undatedItems ?? undatedItems);
    setSources(payload.sources ?? sources);
    if (payload.windowDays) setWindowDays(payload.windowDays);
    setConfirming(null);
    setMessage("已由人工确认创建资讯待办；未修改交易或法定义务。");
  }

  function dateLabel(value: string | null) {
    if (!value) return "日期未知";
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match ? formatDueDate(`${match[1]}-${match[2]}-${match[3]}` as DateOnly) : "日期未知";
  }

  function secondaryItem(item: NewsFeedItem, kind: "excluded" | "undated") {
    return (
      <li key={item.id} className="news-secondary-item" data-testid={`news-secondary-item-${item.id}`}>
        <div>
          <strong>{item.title}</strong>
          <span>{item.sourceName} · {dateLabel(item.publishedAt)} · 命中：{item.matchedKeywords.join("、")}{kind === "excluded" && item.excludedKeywords.length ? ` · 排除：${item.excludedKeywords.join("、")}` : ""}</span>
        </div>
        <a href={item.url} target="_blank" rel="noreferrer">打开原文</a>
      </li>
    );
  }

  return (
    <main className="ledger-shell" data-testid="news-page">
      <aside className="app-rail" aria-label="主导航"><div className="brand-lockup"><span>税务合规看板</span></div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/upload">上传</a><a className="nav-item" href="/import">CSV 导入</a><a className="nav-item" href="/inbox">Inbox</a><a className="nav-item" href="/annual">年度底稿</a><a className="nav-item" href="/div7a">Div 7A</a><a className="nav-item" href="/super">养老金</a><a className="nav-item active" href="/news">资讯</a><a className="nav-item" href="/settings">设置</a></nav></aside>
      <section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 4 · 资讯与人工确认</p><h1>监管资讯</h1><p>首屏读取本地缓存；外部来源后台刷新，单源失败不会阻塞看板或账本。</p></div><div className="news-header-actions"><span className="ai-status" data-testid="ai-status">{aiStatus}</span><button type="button" className="secondary-button" onClick={() => void refresh()} disabled={busy}>{busy ? "启动中…" : "后台刷新"}</button></div></header>
        <section className="news-source-panel" data-testid="news-sources"><div className="inbox-section-heading"><div><p className="page-kicker">来源状态</p><h2>官方来源</h2></div><span>{sources.length} 个来源</span></div><div className="news-source-grid">{sources.map((source) => <div className="news-source-row" key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a><span>{source.lastError ? `最近失败：${source.lastError}` : source.lastFetchedAt ? "最近一次刷新成功" : "尚未刷新"}</span></div>)}</div></section>
        <section className="news-feed" aria-label="资讯列表"><div className="inbox-section-heading"><div><p className="page-kicker">关键词预筛 · published_at 过滤</p><h2>相关资讯</h2></div><span>近 {windowDays} 天 · {items.length} 条命中</span></div>{items.length ? items.map((item) => <NewsCard key={item.id} item={item} onDismiss={(id) => void dismiss(id)} onCreateTodo={(id) => void createTodo(id)} confirming={confirming === item.analysisId} />) : <p className="empty-state">近 {windowDays} 天没有命中关键词的缓存资讯；可启动后台刷新。AI 状态：{aiEnabled ? "已启用" : "已关闭"}。</p>}</section>
        {excludedItems.length ? <details className="news-secondary-feed" data-testid="news-excluded"><summary>可能不适用（按当前主体无雇员/无工资配置排除） · {excludedItems.length} 条</summary><p>这些条目保留在缓存，但不会进入主列表，也不会送入 AI 分析；可在设置页关闭排除。</p><ul>{excludedItems.map((item) => secondaryItem(item, "excluded"))}</ul></details> : null}
        {undatedItems.length ? <details className="news-secondary-feed" data-testid="news-undated"><summary>日期未知（不进入近 {windowDays} 天主列表） · {undatedItems.length} 条</summary><p>来源没有可确认的单篇 Published 日期；系统没有用抓取日或列表页日期补齐。</p><ul>{undatedItems.map((item) => secondaryItem(item, "undated"))}</ul></details> : null}
        <p className="form-message" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
