"use client";

import { ExternalLink } from "lucide-react";
import type { NewsFeedItem } from "@/lib/news/analysis";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";

type Props = {
  item: NewsFeedItem;
  onDismiss: (id: number) => void;
  onCreateTodo: (analysisId: number) => void;
  confirming: boolean;
};

function displayDate(value: string | null) {
  if (!value) return "日期未知";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? formatDueDate(`${match[1]}-${match[2]}-${match[3]}` as DateOnly) : value;
}

export function NewsCard({ item, onDismiss, onCreateTodo, confirming }: Props) {
  const impact = item.analysis?.impactLevel ?? "none";
  return (
    <article className={`news-card news-impact-${impact}`} data-testid={`news-card-${item.id}`}>
      <div className="news-card-topline"><span>{item.sourceName}</span><time dateTime={item.publishedAt ?? undefined}>{displayDate(item.publishedAt)}</time></div>
      <h2>{item.title}</h2>
      {item.analysis ? <p className="news-summary">{item.analysis.summary}</p> : <p className="news-summary">已保存来源信息；关键词预筛后等待分析。</p>}
      {item.analysis?.recommendations.length ? <ul className="news-recommendations">{item.analysis.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul> : null}
      <div className="news-card-actions">
        <a href={item.url} target="_blank" rel="noreferrer">打开原文 <ExternalLink size={13} aria-hidden="true" /></a>
        {item.analysis ? <button type="button" className="secondary-button" onClick={() => onDismiss(item.id)}>忽略</button> : null}
        {item.analysis && item.analysisId !== null && !item.todo ? (
          confirming ? <button type="button" className="primary-button" onClick={() => onCreateTodo(item.analysisId as number)}>确认创建待办</button> : <button type="button" className="secondary-button" onClick={() => onCreateTodo(item.analysisId as number)}>准备建成待办</button>
        ) : item.todo ? <span className="news-todo-state">已确认待办</span> : null}
      </div>
    </article>
  );
}
