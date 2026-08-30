"use client";

import { useState } from "react";
import { DateTextInput } from "@/components/date-text-input";
import { formatCents } from "@/lib/money";
import { formatDueDate, type DateOnly } from "@/lib/time/melbourne";
import type { Asset, AssetScheduleRow, AssetType } from "@/lib/domain/assets/service";

type Entity = { id: string; name: string };
type AssetBundle = { asset: Asset; schedule: AssetScheduleRow[] };

function money(value: number | null) {
  return value === null ? "无法判断" : formatCents(value);
}

function assetTypeLabel(value: AssetType | null) {
  return value === "vehicle" ? "车辆" : value === "equipment" ? "设备" : value === "other" ? "其他" : "未分类";
}

export function AssetsPageClient({ entities, initialAssets }: { entities: Entity[]; initialAssets: AssetBundle[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<AssetType | "">("");
  const [purchaseDate, setPurchaseDate] = useState<DateOnly | null>(null);
  const [availableForUseDate, setAvailableForUseDate] = useState<DateOnly | null>(null);
  const [cost, setCost] = useState("");
  const [usefulLifeYears, setUsefulLifeYears] = useState("");
  const [method, setMethod] = useState<"prime_cost" | "diminishing_value" | "">("");
  const [privateUsePercent, setPrivateUsePercent] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/assets");
    const payload = await response.json() as { assets?: AssetBundle[]; error?: string };
    if (!response.ok) { setMessage(payload.error ?? "资产刷新失败"); return; }
    setAssets(payload.assets ?? []);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!entityId || !name.trim() || !purchaseDate || !cost.trim()) { setMessage("主体、名称、购置日和不含 GST 成本均为必填"); return; }
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        entityId,
        name,
        assetType: assetType || null,
        purchaseDate,
        availableForUseDate,
        costExGst: cost,
        usefulLifeYears: usefulLifeYears ? Number(usefulLifeYears) : null,
        method: method || null,
        privateUsePercent: privateUsePercent === "" ? null : Number(privateUsePercent),
      }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "资产保存失败"); return; }
    setName(""); setAssetType(""); setPurchaseDate(null); setAvailableForUseDate(null); setCost(""); setUsefulLifeYears(""); setMethod(""); setPrivateUsePercent(""); setMessage("资产已保存；未填写的人工参数仍显示为无法判断"); await refresh();
  }

  return <main className="ledger-shell" data-testid="assets-page"><aside className="app-rail"><div className="brand-lockup">税务合规看板</div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/annual">年度底稿</a><a className="nav-item" href="/div7a">Div 7A</a><a className="nav-item active" href="/assets">资产</a><a className="nav-item" href="/super">养老金</a><a className="nav-item" href="/settings">设置</a></nav></aside><section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 7 · 轻量资产登记</p><h1>资产登记与折旧</h1><p>只登记少量车辆/设备；成本一律为不含 GST 分，折旧方法与有效年限必须由用户录入，系统不推定。当前不计算 FBT。</p></div></header><form className="ledger-upload-card asset-form" onSubmit={(event) => void create(event)}><div className="ledger-card-heading"><p className="page-kicker">新增资产</p><h2>登记车辆或设备</h2></div><div className="ledger-form-grid"><label><span>所属主体</span><select value={entityId} onChange={(event) => setEntityId(event.target.value)}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label><span>资产名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：公司车辆" /></label><label><span>资产类型</span><select value={assetType} onChange={(event) => setAssetType(event.target.value as AssetType | "")}><option value="">未分类</option><option value="vehicle">车辆</option><option value="equipment">设备</option><option value="other">其他</option></select></label><label><span>购置日（DD/MM/YYYY）</span><DateTextInput ariaLabel="资产购置日" value={purchaseDate} onChange={setPurchaseDate} /></label><label><span>可使用日（DD/MM/YYYY）</span><DateTextInput ariaLabel="资产可使用日" value={availableForUseDate} onChange={setAvailableForUseDate} /></label><label><span>成本（AUD，不含 GST）</span><input value={cost} onChange={(event) => setCost(event.target.value)} placeholder="例如 55000.00" inputMode="decimal" /></label><label><span>有效年限（年，手动）</span><input value={usefulLifeYears} onChange={(event) => setUsefulLifeYears(event.target.value)} placeholder="不确定则留空" inputMode="numeric" /></label><label><span>折旧方法（手动）</span><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="">无法判断</option><option value="prime_cost">Prime cost</option><option value="diminishing_value">Diminishing value</option></select></label><label><span>私人使用比例（整数 %）</span><input value={privateUsePercent} onChange={(event) => setPrivateUsePercent(event.target.value)} placeholder="不确定则留空" inputMode="numeric" min="0" max="100" /></label></div><p className="asset-form-note">有效年限、折旧方法和私人使用比例没有默认值；缺任一项时不产生折旧金额。</p><button type="submit" className="primary-button">保存资产</button><p className="form-message" aria-live="polite">{message}</p></form><section className="asset-list">{assets.length ? assets.map((bundle) => <AssetCard key={bundle.asset.id} bundle={bundle} onSaved={() => void refresh()} />) : <p className="empty-state">尚未登记资产。</p>}</section></section></main>;
}

function AssetCard({ bundle, onSaved }: { bundle: AssetBundle; onSaved: () => void }) {
  const { asset, schedule } = bundle;
  const [accumulated, setAccumulated] = useState("");
  const [bookValue, setBookValue] = useState("");
  const [sourceDescription, setSourceDescription] = useState("会计 FY2025–26 底稿");
  const [enteredBy, setEnteredBy] = useState("");
  const [enteredAt, setEnteredAt] = useState<DateOnly | null>(null);
  const [disposalDate, setDisposalDate] = useState<DateOnly | null>(asset.disposalDate);
  const [disposalAmount, setDisposalAmount] = useState(asset.disposalAmountCents === null ? "" : (asset.disposalAmountCents / 100).toFixed(2));
  const [cardMessage, setCardMessage] = useState("");

  async function saveOpening() {
    if (!accumulated.trim() || !bookValue.trim() || !sourceDescription.trim() || !enteredBy.trim() || !enteredAt) { setCardMessage("期初累计折旧、账面余额、来源、录入人和录入日期均为必填"); return; }
    const response = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "opening_balance", assetId: asset.id, accumulatedDepreciation: accumulated, bookValue, asOfDate: "2026-06-30", sourceDescription, enteredBy, enteredAt }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setCardMessage(payload.error ?? "资产期初余额保存失败"); return; }
    setCardMessage("30 Jun 2026 期初余额已保存，并已写入 audit_log"); onSaved();
  }

  async function saveDisposal() {
    if (!disposalDate || !disposalAmount.trim()) { setCardMessage("处置日和处置金额均为必填"); return; }
    const response = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disposal", assetId: asset.id, disposalDate, disposalAmount }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setCardMessage(payload.error ?? "处置资料保存失败"); return; }
    setCardMessage("处置资料已保存；处置损益未在轻量模块自动计算"); onSaved();
  }

  return <article className="asset-card" data-testid={`asset-card-${asset.id}`}><div className="annual-card-heading"><div><p className="page-kicker">{asset.entityName} · {assetTypeLabel(asset.assetType)}</p><h2>{asset.name}</h2></div><span>{asset.method === null || asset.usefulLifeYears === null ? "无法判断" : asset.method === "prime_cost" ? "Prime cost" : "Diminishing value"}</span></div><p className="div7a-meta">购置：{formatDueDate(asset.purchaseDate)} · 成本（不含 GST）：{formatCents(asset.costExGstCents)} · 有效年限：{asset.usefulLifeYears === null ? "无法判断" : `${asset.usefulLifeYears} 年`} · 私人使用：{asset.privateUsePercent === null ? "无法判断" : `${asset.privateUsePercent}%`}</p>{asset.assetType === "vehicle" ? <p className="asset-vehicle-warning">车辆提示：私人使用可能另有 FBT 或 Div 7A 后果，尚未评估。请先查看 <a href="/vehicle-fact-checklist" target="_blank" rel="noreferrer">车辆事实清单</a>。</p> : null}<div className="table-scroll"><table className="asset-schedule-table"><thead><tr><th>所得年度</th><th>期初账面余额</th><th>总折旧额</th><th>可抵扣折旧额（私人使用调整）</th><th>期末账面余额</th><th>状态</th></tr></thead><tbody>{schedule.map((row) => <tr key={row.incomeYear}><td>{row.incomeYear.replace("-", "–")}</td><td>{money(row.openingBookValueCents)}</td><td>{money(row.totalDepreciationCents)}</td><td>{money(row.deductibleDepreciationCents)}</td><td>{money(row.closingBookValueCents)}</td><td>{row.status === "ready" ? "已计算" : row.unresolvedReason ?? "无法判断"}</td></tr>)}</tbody></table></div>{asset.purchaseDate <= "2026-06-30" ? <details className="asset-opening-details"><summary>录入 30 Jun 2026 期初累计折旧与账面余额</summary><p className="asset-form-note">来源必须是会计 FY2025–26 底稿；累计折旧 + 账面余额必须等于成本（不含 GST）。未录入时系统不假设为零。</p><div className="asset-opening-form"><label><span>累计折旧（AUD）</span><input value={accumulated} onChange={(event) => setAccumulated(event.target.value)} inputMode="decimal" /></label><label><span>期初账面余额（AUD）</span><input value={bookValue} onChange={(event) => setBookValue(event.target.value)} inputMode="decimal" /></label><label><span>来源说明</span><input value={sourceDescription} onChange={(event) => setSourceDescription(event.target.value)} /></label><label><span>录入人</span><input value={enteredBy} onChange={(event) => setEnteredBy(event.target.value)} /></label><label><span>录入日期（DD/MM/YYYY）</span><DateTextInput ariaLabel={`资产 ${asset.id} 期初余额录入日期`} value={enteredAt} onChange={setEnteredAt} /></label></div><button type="button" className="primary-button" onClick={() => void saveOpening()}>保存期初余额</button></details> : null}<details className="asset-opening-details"><summary>录入处置资料（不自动计算处置损益）</summary><div className="asset-opening-form"><label><span>处置日（DD/MM/YYYY）</span><DateTextInput ariaLabel={`资产 ${asset.id} 处置日`} value={disposalDate} onChange={setDisposalDate} /></label><label><span>处置金额（AUD）</span><input value={disposalAmount} onChange={(event) => setDisposalAmount(event.target.value)} inputMode="decimal" /></label></div><button type="button" className="secondary-button" onClick={() => void saveDisposal()}>保存处置资料</button></details><p className="form-message" aria-live="polite">{cardMessage}</p></article>;
}
