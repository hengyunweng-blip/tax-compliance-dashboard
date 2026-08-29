"use client";

import { useMemo, useState } from "react";
import { CompanyWorksheet } from "@/components/annual/company-worksheet";
import { PersonalSummary } from "@/components/annual/personal-summary";
import { TrustResolutionForm } from "@/components/annual/trust-resolution-form";

type Entity = { id: string; name: string; type: string };
type Props = { entities: Entity[]; initialWorksheets: Array<{ entity: Entity; worksheet: unknown }>; initialIncomeYear: string };

function isCompany(value: unknown): value is Parameters<typeof CompanyWorksheet>[0]["worksheet"] {
  return Boolean(value && typeof value === "object" && "netProfitCents" in value);
}

function isTrust(value: unknown): value is Parameters<typeof TrustResolutionForm>[0]["draft"] {
  return Boolean(value && typeof value === "object" && "resolutionText" in value);
}

function isPersonal(value: unknown): value is Parameters<typeof PersonalSummary>[0]["summary"] {
  return Boolean(value && typeof value === "object" && "concessionalContributionsCents" in value);
}

export function AnnualPageClient({ entities, initialWorksheets, initialIncomeYear }: Props) {
  const [incomeYear, setIncomeYear] = useState(initialIncomeYear);
  const [worksheets, setWorksheets] = useState(initialWorksheets);
  const [selectedEntity, setSelectedEntity] = useState("all");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => selectedEntity === "all" ? worksheets : worksheets.filter((item) => item.entity.id === selectedEntity), [selectedEntity, worksheets]);

  async function changeYear(next: string) {
    setIncomeYear(next);
    const response = await fetch(`/api/annual?fy=${encodeURIComponent(next)}`);
    const payload = await response.json() as { worksheets?: typeof initialWorksheets; error?: string };
    if (!response.ok) { setMessage(payload.error ?? "年度底稿加载失败"); return; }
    setWorksheets(payload.worksheets ?? []);
    setMessage(`已按 ${next.replace("-", "–")} 所属年度重新聚合；截止日所在财年不参与聚合。`);
  }

  return (
    <main className="ledger-shell" data-testid="annual-page">
      <aside className="app-rail"><div className="brand-lockup">税务合规看板</div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/inbox">Inbox</a><a className="nav-item active" href="/annual">年度底稿</a><a className="nav-item" href="/div7a">Div 7A</a><a className="nav-item" href="/assets">资产</a><a className="nav-item" href="/super">养老金</a><a className="nav-item" href="/news">资讯</a><a className="nav-item" href="/settings">设置</a></nav></aside>
      <section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 5 · 所属年度聚合</p><h1>年度底稿</h1><p>公司、信托和个人均按 income_year 汇总；年度收入、费用与资本采购均按不含 GST 口径；所有自动计算都保留来源交易，人工项目不会被假装已完成。</p></div></header>
        <div className="annual-toolbar"><label><span>所属年度</span><select value={incomeYear} onChange={(event) => void changeYear(event.target.value)}><option value="FY2025-26">FY2025–26</option><option value="FY2026-27">FY2026–27</option></select></label><label><span>主体</span><select value={selectedEntity} onChange={(event) => setSelectedEntity(event.target.value)}><option value="all">全部主体</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label></div>
        <div className="annual-worksheet-list">{filtered.map(({ entity, worksheet }) => isCompany(worksheet) ? <CompanyWorksheet key={entity.id} worksheet={worksheet} /> : isTrust(worksheet) ? <TrustResolutionForm key={entity.id} draft={worksheet} /> : isPersonal(worksheet) ? <PersonalSummary key={entity.id} summary={worksheet} /> : null)}</div>
        <p className="form-message" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
