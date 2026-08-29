"use client";

import { useState } from "react";
import { Info, Save, Settings2, ShieldCheck } from "lucide-react";
import { getEntityConfigurationStatus } from "@/lib/settings-status";
import { DateTextInput } from "@/components/date-text-input";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";
import type { Div7aBenchmarkRate } from "@/lib/domain/div7a/rates";

type Entity = {
  id: string;
  name: string;
  type: string;
  acn: string | null;
  incorporationDate: DateOnly | null;
  asicReviewDate: DateOnly | null;
  gstRegistered: boolean;
  active: boolean;
  basCycle: string;
};

type Licence = {
  id: number;
  holder: string;
  type: string;
  licenceNumber: string | null;
  anniversaryDate: DateOnly | null;
  regulator: string;
  portalUrl: string;
  lodgementWindowWeeks: number;
};

type Snapshot = {
  entities: Entity[];
  licence: Licence | null;
  settings: Record<string, string>;
  benchmarkRates: Div7aBenchmarkRate[];
};

type Props = { initialSnapshot: Snapshot };

export function SettingsForm({ initialSnapshot }: Props) {
  const [activeTab, setActiveTab] = useState<"entities" | "licence" | "div7a">("entities");
  const [entities, setEntities] = useState(initialSnapshot.entities);
  const [licence, setLicence] = useState(initialSnapshot.licence);
  const [benchmarkRates, setBenchmarkRates] = useState(initialSnapshot.benchmarkRates);
  const [newsWindowDays, setNewsWindowDays] = useState(Number(initialSnapshot.settings.news_window_days ?? "90"));
  const [excludeIrrelevantTopics, setExcludeIrrelevantTopics] = useState(initialSnapshot.settings.news_exclude_irrelevant_topics !== "false");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [rateIncomeYear, setRateIncomeYear] = useState("");
  const [rateText, setRateText] = useState("");
  const [rateSourceUrl, setRateSourceUrl] = useState("https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate");
  const [rateRetrievedAt, setRateRetrievedAt] = useState<DateOnly | null>(null);
  const [rateNotes, setRateNotes] = useState("");
  const [rateSaveState, setRateSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function updateEntity(id: string, patch: Partial<Entity>) {
    setEntities((current) => current.map((entity) => entity.id === id ? { ...entity, ...patch } : entity));
    setSaveState("idle");
  }

  async function save() {
    setSaveState("saving");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entities: entities.map((entity) => ({
          entityId: entity.id,
          acn: entity.acn || null,
          incorporationDate: entity.incorporationDate || null,
          asicReviewDate: entity.asicReviewDate || null,
          gstRegistered: entity.gstRegistered,
          active: entity.active,
        })),
        licence: licence ? {
          licenceId: licence.id,
          licenceNumber: licence.licenceNumber || null,
          anniversaryDate: licence.anniversaryDate || null,
        } : undefined,
        newsWindowDays,
        excludeIrrelevantTopics,
      }),
    });

    if (!response.ok) {
      setSaveState("error");
      return;
    }

    const next = await response.json() as Snapshot;
    setEntities(next.entities);
    setLicence(next.licence);
    setBenchmarkRates(next.benchmarkRates ?? benchmarkRates);
    setNewsWindowDays(Number(next.settings.news_window_days ?? newsWindowDays));
    setExcludeIrrelevantTopics(next.settings.news_exclude_irrelevant_topics !== "false");
    setSaveState("saved");
  }

  function editRate(rate: Div7aBenchmarkRate) {
    setRateIncomeYear(rate.incomeYear);
    setRateText(rate.rateText);
    setRateSourceUrl(rate.sourceUrl);
    setRateRetrievedAt(rate.retrievedAt as DateOnly);
    setRateNotes(rate.notes ?? "");
    setRateSaveState("idle");
  }

  async function saveRate() {
    if (!rateIncomeYear.trim() || !rateText.trim() || !rateSourceUrl.trim() || !rateRetrievedAt) {
      setRateSaveState("error");
      return;
    }
    setRateSaveState("saving");
    const response = await fetch("/api/div7a/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incomeYear: rateIncomeYear,
        rateText,
        sourceUrl: rateSourceUrl,
        retrievedAt: rateRetrievedAt,
        notes: rateNotes || null,
      }),
    });
    const payload = await response.json() as { rates?: Div7aBenchmarkRate[]; error?: string };
    if (!response.ok) {
      setRateSaveState("error");
      return;
    }
    setBenchmarkRates(payload.rates ?? benchmarkRates);
    setRateSaveState("saved");
  }

  return (
    <main className="settings-shell">
      <aside className="app-rail" aria-label="主导航">
        <div className="brand-lockup">
          <ShieldCheck size={27} strokeWidth={2.1} aria-hidden="true" />
          <span>税务合规看板</span>
        </div>
        <nav className="app-nav">
          <a href="#settings" className="nav-item">
            <Settings2 size={19} aria-hidden="true" />
            <span>设置</span>
          </a>
        </nav>
      </aside>

      <section className="settings-content" id="settings">
        <header className="settings-header">
          <div>
            <p className="page-kicker">本地配置</p>
            <h1>设置</h1>
          </div>
          <div className="timezone-note">时区：Australia/Melbourne</div>
        </header>

        <div className="settings-tabs" role="tablist" aria-label="设置类别">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "entities"}
            className={activeTab === "entities" ? "settings-tab active" : "settings-tab"}
            onClick={() => setActiveTab("entities")}
          >
            主体配置
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "licence"}
            className={activeTab === "licence" ? "settings-tab active" : "settings-tab"}
            onClick={() => setActiveTab("licence")}
          >
            牌照配置
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "div7a"}
            className={activeTab === "div7a" ? "settings-tab active" : "settings-tab"}
            onClick={() => setActiveTab("div7a")}
          >
            Div 7A 利率
          </button>
        </div>

        {activeTab === "entities" ? (
          <section className="settings-panel" aria-label="主体配置">
            <div className="panel-heading">
              <div>
                <h2>主体配置</h2>
                <p>公司 ACN 与 ASIC 周年日用于生成后续法定义务；个人与信托不适用的字段不会进入配置状态判断。</p>
              </div>
              <span className="panel-count">{entities.length} 个主体</span>
            </div>
            <div className="table-scroll">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">主体名称</th>
                    <th scope="col">ACN</th>
                    <th scope="col">ASIC 周年日 <Info size={14} aria-label="ASIC review date" /></th>
                    <th scope="col">GST 已注册 <Info size={14} aria-label="GST registration" /></th>
                    <th scope="col">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map((entity, index) => {
                    const isCompany = entity.type === "company";
                    const status = getEntityConfigurationStatus(entity);
                    return (
                      <tr key={entity.id} data-testid={`entity-row-${entity.id}`}>
                        <td data-label="#" className="row-number">{index + 1}</td>
                        <td data-label="主体名称" className="entity-name-cell">
                          <strong>{entity.name}</strong>
                          <small>{entity.type === "company" ? "公司" : entity.type === "trust" ? "信托" : "个人"}</small>
                        </td>
                        <td data-label="ACN">
                          {isCompany ? (
                            <input
                              aria-label="ACN"
                              value={entity.acn ?? ""}
                              onChange={(event) => updateEntity(entity.id, { acn: event.target.value })}
                              placeholder="待填"
                              inputMode="numeric"
                            />
                          ) : <span className="not-applicable">不适用</span>}
                        </td>
                        <td data-label="ASIC 周年日">
                          {isCompany ? (
                            <DateTextInput
                              ariaLabel="ASIC 周年日"
                              value={entity.asicReviewDate}
                              onChange={(value) => updateEntity(entity.id, { asicReviewDate: value })}
                            />
                          ) : <span className="not-applicable">不适用</span>}
                        </td>
                        <td data-label="GST 已注册">
                          {isCompany ? (
                            <select
                              aria-label="GST 已注册"
                              value={entity.gstRegistered ? "yes" : "no"}
                              onChange={(event) => updateEntity(entity.id, { gstRegistered: event.target.value === "yes" })}
                            >
                              <option value="yes">是</option>
                              <option value="no">否</option>
                            </select>
                          ) : <span className="not-applicable">不适用</span>}
                        </td>
                        <td data-label="状态">
                          <span className={status === "ready" ? "status-ready" : "status-pending"}>
                            {status === "ready" ? "已配置" : "待配置"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : activeTab === "licence" ? (
          <section className="settings-panel licence-panel" aria-label="牌照配置">
            <div className="panel-heading">
              <div>
                <h2>牌照配置</h2>
                <p>牌照周年日前 6 周进入年度声明窗口；未填写时义务显示为“待配置”。</p>
              </div>
            </div>
            {licence ? (
              <div className="licence-form">
                <label>
                  <span>牌照号码</span>
                  <input
                    value={licence.licenceNumber ?? ""}
                    onChange={(event) => { setLicence({ ...licence, licenceNumber: event.target.value }); setSaveState("idle"); }}
                    placeholder="待填"
                  />
                </label>
                <label>
                  <span>牌照周年日</span>
                  <DateTextInput
                    ariaLabel="牌照周年日"
                    value={licence.anniversaryDate}
                    onChange={(value) => { setLicence({ ...licence, anniversaryDate: value }); setSaveState("idle"); }}
                  />
                </label>
                <div className="licence-meta">
                  <span>监管方：{licence.regulator}</span>
                  <a href={licence.portalUrl} target="_blank" rel="noreferrer">打开官方入口</a>
                </div>
              </div>
            ) : <p className="empty-state">尚未生成牌照配置。</p>}
          </section>
        ) : (
          <section className="settings-panel div7a-rate-panel" aria-label="Div 7A 年度基准利率">
            <div className="panel-heading">
              <div>
                <h2>Div 7A 年度基准利率</h2>
                <p>每个所得年度必须由用户从 ATO 官方页面核对后手动录入；缺少对应年度时，贷款金额显示“无法判断”，不会回退到旧贷款字段或其他年度。</p>
              </div>
              <span className="panel-count">{benchmarkRates.length} 个年度</span>
            </div>
            <div className="div7a-rate-form">
              <label><span>所得年度</span><input aria-label="Div 7A 所得年度" value={rateIncomeYear} onChange={(event) => setRateIncomeYear(event.target.value)} placeholder="FY2026-27" /></label>
              <label><span>基准利率（保留原始文本）</span><input aria-label="Div 7A 基准利率" value={rateText} onChange={(event) => setRateText(event.target.value)} placeholder="8.77%" /></label>
              <label><span>ATO 来源 URL</span><input aria-label="Div 7A 来源 URL" value={rateSourceUrl} onChange={(event) => setRateSourceUrl(event.target.value)} /></label>
              <label><span>取数日期（DD/MM/YYYY）</span><DateTextInput ariaLabel="Div 7A 取数日期" value={rateRetrievedAt} onChange={setRateRetrievedAt} /></label>
              <label className="div7a-rate-notes"><span>备注（可选）</span><input aria-label="Div 7A 利率备注" value={rateNotes} onChange={(event) => setRateNotes(event.target.value)} placeholder="例如：ATO 年度表，人工核对" /></label>
              <button type="button" className="primary-button" onClick={() => void saveRate()} disabled={rateSaveState === "saving"}>{rateSaveState === "saving" ? "保存中…" : "保存年度利率"}</button>
              <p className="form-message" aria-live="polite">{rateSaveState === "saved" ? "年度利率已保存" : rateSaveState === "error" ? "请填写完整并确认 URL 来自 ATO" : ""}</p>
            </div>
            <div className="table-scroll">
              <table className="settings-table div7a-rate-table">
                <thead><tr><th>所得年度</th><th>基准利率</th><th>来源</th><th>取数日期</th><th>录入方式</th><th /></tr></thead>
                <tbody>{benchmarkRates.map((rate) => <tr key={rate.incomeYear}><td>{rate.incomeYear.replace("-", "–")}</td><td><strong>{rate.rateText}</strong></td><td><a href={rate.sourceUrl} target="_blank" rel="noreferrer">ATO 官方页面</a></td><td>{formatDueDate(rate.retrievedAt as DateOnly)}</td><td>{rate.entryMethod}</td><td><button type="button" className="text-button" onClick={() => editRate(rate)}>编辑</button></td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        <section className="settings-panel news-settings-panel" aria-label="资讯设置">
          <div className="panel-heading">
            <div>
              <h2>资讯设置</h2>
              <p>相关资讯主列表按发布日期筛选；默认只显示近 90 天，并且必须先命中收紧后的关键词。</p>
            </div>
          </div>
          <div className="news-settings-form">
            <label>
              <span>相关资讯窗口（天）</span>
              <input
                aria-label="相关资讯窗口（天）"
                type="number"
                min={1}
                max={3650}
                step={1}
                value={newsWindowDays}
                onChange={(event) => { setNewsWindowDays(Number(event.target.value)); setSaveState("idle"); }}
              />
              <small>按 `published_at` 计算；允许 1–3650 天。</small>
            </label>
            <label className="news-exclusion-toggle">
              <span>主体不适用主题排除</span>
              <span className="checkbox-line">
                <input
                  aria-label="按主体配置排除不适用主题"
                  type="checkbox"
                  checked={excludeIrrelevantTopics}
                  onChange={(event) => { setExcludeIrrelevantTopics(event.target.checked); setSaveState("idle"); }}
                />
                <span>当前主体无雇员/无工资时，排除 payroll、STP、Payday Super、SBSCH、super guarantee、fuel tax credit 等资讯</span>
              </span>
              <small>关闭后这些条目仍可进入主列表；不会影响原始缓存。</small>
            </label>
          </div>
        </section>

        <div className="settings-actions">
          <div aria-live="polite" className="save-message">
            {saveState === "saved" ? "设置已保存" : saveState === "error" ? "保存失败，请检查输入" : ""}
          </div>
          <button type="button" className="primary-button" onClick={save} disabled={saveState === "saving"}>
            <Save size={17} aria-hidden="true" />
            {saveState === "saving" ? "保存中…" : "保存设置"}
          </button>
        </div>
      </section>
    </main>
  );
}
