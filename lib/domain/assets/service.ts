import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { assertIntegerCents } from "@/lib/money";
import { calculateAssetDepreciationCents, calculateDeductibleDepreciationCents, fiscalYearBounds, type AssetMethod } from "@/lib/domain/assets/formula";
import { assertDateOnly, formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export type AssetType = "vehicle" | "equipment" | "other";

export type Asset = {
  id: number;
  entityId: string;
  entityName: string;
  name: string;
  assetType: AssetType | null;
  purchaseDate: DateOnly;
  availableForUseDate: DateOnly | null;
  costExGstCents: number;
  usefulLifeYears: number | null;
  method: AssetMethod | null;
  privateUsePercent: number | null;
  openingAccumulatedDepreciationCents: number | null;
  openingBookValueCents: number | null;
  disposalDate: DateOnly | null;
  disposalAmountCents: number | null;
  notes: string | null;
};

export type AssetDepreciationSummary = {
  assetId: number;
  entityId: string;
  name: string;
  assetType: AssetType | null;
  incomeYear: string;
  openingBookValueCents: number | null;
  openingAccumulatedDepreciationCents: number | null;
  totalDepreciationCents: number | null;
  deductibleDepreciationCents: number | null;
  closingBookValueCents: number | null;
  status: "ready" | "manual_review";
  unresolvedReason: string | null;
  vehicleWarning: string | null;
};

export type AssetScheduleRow = AssetDepreciationSummary;

const ASSET_CUTOVER_DATE: DateOnly = "2026-06-30";
const ASSET_FIRST_INCOME_YEAR = "FY2026-27";

function normalizeDate(value: string, label: string): DateOnly {
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) throw new Error(`${label}无效: ${value}`);
  return date;
}

function normalizeIncomeYear(value: string) {
  const normalized = value.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid income year: ${value}`);
  return `FY${normalized}`;
}

function assertAssetType(value: string | null): asserts value is AssetType | null {
  if (value !== null && !["vehicle", "equipment", "other"].includes(value)) throw new Error(`Invalid asset type: ${value}`);
}

function assertMethod(value: string | null): asserts value is AssetMethod | null {
  if (value !== null && !["prime_cost", "diminishing_value"].includes(value)) throw new Error(`Invalid depreciation method: ${value}`);
}

function mapAsset(row: {
  id: number;
  entity_id: string;
  entity_name: string;
  name: string;
  asset_type: string | null;
  purchase_date: DateOnly;
  available_for_use_date: DateOnly | null;
  cost_ex_gst_cents: number;
  useful_life_years: number | null;
  method: string | null;
  private_use_percent: number | null;
  opening_accumulated_depreciation_cents: number | null;
  opening_book_value_cents: number | null;
  disposal_date: DateOnly | null;
  disposal_amount_cents: number | null;
  notes: string | null;
}): Asset {
  assertIntegerCents(row.cost_ex_gst_cents);
  if (row.opening_accumulated_depreciation_cents !== null) assertIntegerCents(row.opening_accumulated_depreciation_cents);
  if (row.opening_book_value_cents !== null) assertIntegerCents(row.opening_book_value_cents);
  if (row.disposal_amount_cents !== null) assertIntegerCents(row.disposal_amount_cents);
  assertAssetType(row.asset_type);
  assertMethod(row.method);
  return {
    id: row.id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    name: row.name,
    assetType: row.asset_type,
    purchaseDate: normalizeDate(row.purchase_date, "购置日"),
    availableForUseDate: row.available_for_use_date ? normalizeDate(row.available_for_use_date, "可使用日期") : null,
    costExGstCents: row.cost_ex_gst_cents,
    usefulLifeYears: row.useful_life_years,
    method: row.method,
    privateUsePercent: row.private_use_percent,
    openingAccumulatedDepreciationCents: row.opening_accumulated_depreciation_cents,
    openingBookValueCents: row.opening_book_value_cents,
    disposalDate: row.disposal_date ? normalizeDate(row.disposal_date, "处置日") : null,
    disposalAmountCents: row.disposal_amount_cents,
    notes: row.notes,
  };
}

function assetRow(assetId: number): Asset {
  const row = getRawDb().prepare(`
    SELECT a.*, e.name AS entity_name
    FROM assets a INNER JOIN entities e ON e.id = a.entity_id
    WHERE a.id = ?
  `).get(assetId) as Parameters<typeof mapAsset>[0] | undefined;
  if (!row) throw new Error(`Asset not found: ${assetId}`);
  return mapAsset(row);
}

export function listAssets(entityId?: string): Asset[] {
  runMigrations();
  const rows = getRawDb().prepare(`
    SELECT a.*, e.name AS entity_name
    FROM assets a INNER JOIN entities e ON e.id = a.entity_id
    WHERE (? IS NULL OR a.entity_id = ?)
    ORDER BY a.entity_id, a.purchase_date, a.id
  `).all(entityId ?? null, entityId ?? null) as Array<Parameters<typeof mapAsset>[0]>;
  return rows.map(mapAsset);
}

function validatePercentage(value: number | null | undefined) {
  if (value === null || value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0 || value > 100) throw new Error("Private use percentage must be an integer from 0 to 100");
}

function validateOptionalLife(value: number | null | undefined) {
  if (value === null || value === undefined) return;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100) throw new Error("Useful life must be an integer from 1 to 100 years");
}

export function createAsset(input: {
  entityId: string;
  name: string;
  assetType?: AssetType | null;
  purchaseDate: string;
  availableForUseDate?: string | null;
  costExGstCents: number;
  usefulLifeYears?: number | null;
  method?: AssetMethod | null;
  privateUsePercent?: number | null;
  notes?: string | null;
}): number {
  runMigrations();
  const name = input.name.trim();
  if (!name) throw new Error("Asset name is required");
  const purchaseDate = normalizeDate(input.purchaseDate, "购置日");
  const availableForUseDate = input.availableForUseDate ? normalizeDate(input.availableForUseDate, "可使用日期") : null;
  if (availableForUseDate && availableForUseDate < purchaseDate) throw new Error("可使用日期不能早于购置日");
  assertIntegerCents(input.costExGstCents);
  if (input.costExGstCents <= 0) throw new Error("Asset cost must be positive");
  validateOptionalLife(input.usefulLifeYears);
  validatePercentage(input.privateUsePercent);
  if (input.assetType !== undefined && input.assetType !== null) assertAssetType(input.assetType);
  if (input.method !== undefined && input.method !== null) assertMethod(input.method);
  const entity = getRawDb().prepare("SELECT id FROM entities WHERE id = ? AND active = 1").get(input.entityId);
  if (!entity) throw new Error(`Entity not found: ${input.entityId}`);
  const result = getRawDb().prepare(`
    INSERT INTO assets (
      entity_id, name, asset_type, purchase_date, available_for_use_date, cost_ex_gst_cents,
      useful_life_years, method, private_use_percent, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.entityId,
    name,
    input.assetType ?? null,
    purchaseDate,
    availableForUseDate,
    input.costExGstCents,
    input.usefulLifeYears ?? null,
    input.method ?? null,
    input.privateUsePercent ?? null,
    input.notes?.trim() || null,
  );
  return Number(result.lastInsertRowid);
}

function openingState(asset: Asset): { bookValueCents: number | null; accumulatedCents: number | null; reason: string | null } {
  if (asset.purchaseDate > ASSET_CUTOVER_DATE) {
    return { bookValueCents: asset.costExGstCents, accumulatedCents: 0, reason: null };
  }
  if (asset.openingAccumulatedDepreciationCents === null || asset.openingBookValueCents === null) {
    const rows = getRawDb().prepare(`
      SELECT category, amount_cents
      FROM opening_balances
      WHERE reference_type = 'asset' AND reference_id = ? AND as_of_date = ?
    `).all(`asset:${asset.id}`, ASSET_CUTOVER_DATE) as Array<{ category: string; amount_cents: number | null }>;
    const accumulated = rows.find((row) => row.category === "asset_accumulated_depreciation")?.amount_cents ?? null;
    const bookValue = rows.find((row) => row.category === "asset_book_value")?.amount_cents ?? null;
    if (accumulated !== null && bookValue !== null) {
      assertIntegerCents(accumulated);
      assertIntegerCents(bookValue);
      return { bookValueCents: bookValue, accumulatedCents: accumulated, reason: null };
    }
    return { bookValueCents: null, accumulatedCents: null, reason: "无法判断 / 期初余额未配置（需要 30 Jun 2026 会计 FY2025–26 底稿余额）" };
  }
  return {
    bookValueCents: asset.openingBookValueCents,
    accumulatedCents: asset.openingAccumulatedDepreciationCents,
    reason: null,
  };
}

function configurationReason(asset: Asset) {
  if (asset.usefulLifeYears === null || asset.method === null) return "无法判断 / 有效年限与折旧方法未配置";
  if (asset.privateUsePercent === null) return "无法判断 / 私人使用比例未配置";
  if (asset.availableForUseDate === null) return "无法判断 / 可使用日期未配置";
  return null;
}

function buildAssetRow(asset: Asset, incomeYear: string, openingBookValueCents: number | null, openingAccumulatedDepreciationCents: number | null, inheritedReason: string | null): AssetScheduleRow {
  const configuration = configurationReason(asset);
  const unresolvedReason = inheritedReason ?? configuration;
  if (unresolvedReason || openingBookValueCents === null || openingAccumulatedDepreciationCents === null || asset.method === null || asset.usefulLifeYears === null || asset.privateUsePercent === null || asset.availableForUseDate === null) {
    return {
      assetId: asset.id,
      entityId: asset.entityId,
      name: asset.name,
      assetType: asset.assetType,
      incomeYear,
      openingBookValueCents,
      openingAccumulatedDepreciationCents,
      totalDepreciationCents: null,
      deductibleDepreciationCents: null,
      closingBookValueCents: null,
      status: "manual_review",
      unresolvedReason: unresolvedReason ?? "无法判断",
      vehicleWarning: asset.assetType === "vehicle" ? "私人使用可能另有 FBT 或 Div 7A 后果，尚未评估。" : null,
    };
  }

  const { start, end } = fiscalYearBounds(incomeYear);
  const totalDepreciationCents = calculateAssetDepreciationCents({
    costExGstCents: asset.costExGstCents,
    openingBookValueCents,
    usefulLifeYears: asset.usefulLifeYears,
    method: asset.method,
    periodStart: start,
    periodEnd: end,
    availableForUseDate: asset.availableForUseDate,
    disposalDate: asset.disposalDate,
  });
  const deductibleDepreciationCents = calculateDeductibleDepreciationCents(totalDepreciationCents, asset.privateUsePercent);
  const closingBookValueCents = Math.max(0, openingBookValueCents - totalDepreciationCents);
  assertIntegerCents(totalDepreciationCents);
  assertIntegerCents(deductibleDepreciationCents);
  assertIntegerCents(closingBookValueCents);
  return {
    assetId: asset.id,
    entityId: asset.entityId,
    name: asset.name,
    assetType: asset.assetType,
    incomeYear,
    openingBookValueCents,
    openingAccumulatedDepreciationCents,
    totalDepreciationCents,
    deductibleDepreciationCents,
    closingBookValueCents,
    status: "ready",
    unresolvedReason: null,
    vehicleWarning: asset.assetType === "vehicle" ? "私人使用可能另有 FBT 或 Div 7A 后果，尚未评估。" : null,
  };
}

export function getAssetSchedule(assetId: number, fromIncomeYear = ASSET_FIRST_INCOME_YEAR, throughIncomeYear = fromIncomeYear): AssetScheduleRow[] {
  runMigrations();
  const asset = assetRow(assetId);
  const start = Number(normalizeIncomeYear(fromIncomeYear).slice(2, 6));
  const end = Number(normalizeIncomeYear(throughIncomeYear).slice(2, 6));
  if (end < start) throw new Error("Asset schedule end year cannot be before start year");
  let opening = openingState(asset);
  const rows: AssetScheduleRow[] = [];
  for (let year = start; year <= end; year += 1) {
    const incomeYear = `FY${year}-${String(year + 1).slice(-2)}`;
    const row = buildAssetRow(asset, incomeYear, opening.bookValueCents, opening.accumulatedCents, opening.reason);
    rows.push(row);
    if (row.status === "ready" && row.closingBookValueCents !== null && row.openingAccumulatedDepreciationCents !== null && row.totalDepreciationCents !== null) {
      opening = {
        bookValueCents: row.closingBookValueCents,
        accumulatedCents: row.openingAccumulatedDepreciationCents + row.totalDepreciationCents,
        reason: null,
      };
    } else {
      opening = { bookValueCents: null, accumulatedCents: null, reason: row.unresolvedReason };
    }
  }
  return rows;
}

export function getAssetDepreciationSummary(assetId: number, incomeYear: string): AssetDepreciationSummary {
  const rows = getAssetSchedule(assetId, ASSET_FIRST_INCOME_YEAR, incomeYear);
  return rows.at(-1) as AssetDepreciationSummary;
}

export function getAssetDepreciationForEntity(entityId: string, incomeYear: string) {
  const rows = listAssets(entityId).map((asset) => getAssetDepreciationSummary(asset.id, incomeYear));
  if (rows.length === 0) {
    return { status: "ready" as const, totalDepreciationCents: 0, deductibleDepreciationCents: 0, rows, unresolvedReason: null };
  }
  const unresolved = rows.find((row) => row.status !== "ready");
  if (unresolved) {
    return { status: "manual_review" as const, totalDepreciationCents: null, deductibleDepreciationCents: null, rows, unresolvedReason: unresolved.unresolvedReason };
  }
  const totalDepreciationCents = rows.reduce((total, row) => total + (row.totalDepreciationCents ?? 0), 0);
  const deductibleDepreciationCents = rows.reduce((total, row) => total + (row.deductibleDepreciationCents ?? 0), 0);
  assertIntegerCents(totalDepreciationCents);
  assertIntegerCents(deductibleDepreciationCents);
  return { status: "ready" as const, totalDepreciationCents, deductibleDepreciationCents, rows, unresolvedReason: null };
}

export function saveAssetOpeningBalance(input: {
  assetId: number;
  accumulatedDepreciationCents: number;
  bookValueCents: number;
  asOfDate: string;
  sourceDescription: string;
  enteredBy: string;
  enteredAt: string;
  notes?: string | null;
}) {
  runMigrations();
  const asOfDate = normalizeDate(input.asOfDate, "资产期初余额切换日");
  if (asOfDate !== ASSET_CUTOVER_DATE) throw new Error(`资产期初余额切换日必须为 ${ASSET_CUTOVER_DATE}`);
  assertIntegerCents(input.accumulatedDepreciationCents);
  assertIntegerCents(input.bookValueCents);
  if (input.accumulatedDepreciationCents < 0 || input.bookValueCents < 0) throw new Error("Opening asset values cannot be negative");
  const sourceDescription = input.sourceDescription.trim();
  const enteredBy = input.enteredBy.trim();
  if (!sourceDescription || !enteredBy) throw new Error("期初余额来源说明和录入人均为必填");
  const enteredAt = normalizeDate(input.enteredAt.slice(0, 10), "资产期初余额录入日期");
  const db = getRawDb();
  const asset = db.prepare("SELECT id, entity_id, cost_ex_gst_cents FROM assets WHERE id = ?").get(input.assetId) as { id: number; entity_id: string; cost_ex_gst_cents: number } | undefined;
  if (!asset) throw new Error(`Asset not found: ${input.assetId}`);
  if (input.accumulatedDepreciationCents + input.bookValueCents !== asset.cost_ex_gst_cents) throw new Error("期初累计折旧与账面余额必须等于不含 GST 成本");
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE assets
      SET opening_accumulated_depreciation_cents = ?, opening_book_value_cents = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(input.accumulatedDepreciationCents, input.bookValueCents, input.assetId);
    const insertOpening = db.prepare(`
      INSERT INTO opening_balances (
        entity_id, category, reference_type, reference_id, as_of_date, amount_cents, value_text,
        source_description, entered_by, entered_at, notes
      ) VALUES (?, ?, 'asset', ?, ?, ?, NULL, ?, ?, ?, ?)
      ON CONFLICT(category, reference_id, as_of_date) DO UPDATE SET
        entity_id = excluded.entity_id, amount_cents = excluded.amount_cents,
        source_description = excluded.source_description, entered_by = excluded.entered_by,
        entered_at = excluded.entered_at, notes = excluded.notes, updated_at = datetime('now')
    `);
    insertOpening.run(asset.entity_id, "asset_accumulated_depreciation", `asset:${input.assetId}`, asOfDate, input.accumulatedDepreciationCents, sourceDescription, enteredBy, enteredAt, input.notes?.trim() || null);
    insertOpening.run(asset.entity_id, "asset_book_value", `asset:${input.assetId}`, asOfDate, input.bookValueCents, sourceDescription, enteredBy, enteredAt, input.notes?.trim() || null);
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, reason, metadata_json)
      VALUES (?, ?, ?, ?)
    `).run(
      "asset_opening_balance",
      String(input.assetId),
      "录入/更新 30 Jun 2026 资产期初累计折旧与账面余额",
      JSON.stringify({ accumulatedDepreciationCents: input.accumulatedDepreciationCents, bookValueCents: input.bookValueCents, asOfDate, sourceDescription, enteredBy, enteredAt }),
    );
  });
  transaction();
}

export function recordAssetDisposal(input: { assetId: number; disposalDate: string; disposalAmountCents: number }) {
  runMigrations();
  const disposalDate = normalizeDate(input.disposalDate, "处置日");
  assertIntegerCents(input.disposalAmountCents);
  if (input.disposalAmountCents < 0) throw new Error("Disposal amount cannot be negative");
  const db = getRawDb();
  if (!db.prepare("SELECT id FROM assets WHERE id = ?").get(input.assetId)) throw new Error(`Asset not found: ${input.assetId}`);
  db.prepare("UPDATE assets SET disposal_date = ?, disposal_amount_cents = ?, updated_at = datetime('now') WHERE id = ?").run(disposalDate, input.disposalAmountCents, input.assetId);
}

