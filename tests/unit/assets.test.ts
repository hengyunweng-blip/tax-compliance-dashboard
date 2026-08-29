import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import {
  createAsset,
  getAssetDepreciationSummary,
  getAssetSchedule,
  saveAssetOpeningBalance,
} from "@/lib/domain/assets/service";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM assets; DELETE FROM opening_balances; DELETE FROM audit_log;");
});

test("prime cost produces a five-year sequence with an exact integer-cent first year", () => {
  const assetId = createAsset({
    entityId: "boyun_co",
    name: "Equipment prime cost",
    assetType: "equipment",
    purchaseDate: "2026-07-01",
    availableForUseDate: "2026-07-01",
    costExGstCents: 1_000_000,
    usefulLifeYears: 5,
    method: "prime_cost",
    privateUsePercent: 0,
  });

  const schedule = getAssetSchedule(assetId, "FY2026-27", "FY2030-31");

  expect(schedule).toHaveLength(5);
  expect(schedule.map((row) => row.totalDepreciationCents)).toEqual([200_000, 200_000, 200_000, 200_000, 200_000]);
  expect(schedule.at(-1)?.closingBookValueCents).toBe(0);
});

test("diminishing value produces a five-year sequence from the declining book value", () => {
  const assetId = createAsset({
    entityId: "boyun_co",
    name: "Equipment diminishing value",
    assetType: "equipment",
    purchaseDate: "2026-07-01",
    availableForUseDate: "2026-07-01",
    costExGstCents: 1_000_000,
    usefulLifeYears: 5,
    method: "diminishing_value",
    privateUsePercent: 0,
  });

  const schedule = getAssetSchedule(assetId, "FY2026-27", "FY2030-31");

  expect(schedule.map((row) => row.totalDepreciationCents)).toEqual([400_000, 240_000, 144_000, 86_400, 51_840]);
  expect(schedule.map((row) => row.closingBookValueCents)).toEqual([600_000, 360_000, 216_000, 129_600, 77_760]);
});

test("first year prorates by days and private use reduces only deductible depreciation", () => {
  const assetId = createAsset({
    entityId: "boyun_co",
    name: "Part-year private equipment",
    assetType: "equipment",
    purchaseDate: "2026-10-01",
    availableForUseDate: "2026-10-01",
    costExGstCents: 1_000_000,
    usefulLifeYears: 5,
    method: "prime_cost",
    privateUsePercent: 30,
  });

  const summary = getAssetDepreciationSummary(assetId, "FY2026-27");

  expect(summary.totalDepreciationCents).toBe(149_589);
  expect(summary.deductibleDepreciationCents).toBe(104_712);
  expect(summary.openingBookValueCents).toBe(1_000_000);
  expect(summary.closingBookValueCents).toBe(850_411);
});

test("pre-cutover asset continues from the recorded opening balance and writes provenance", () => {
  const assetId = createAsset({
    entityId: "boyun_co",
    name: "Opening equipment",
    assetType: "equipment",
    purchaseDate: "2020-07-01",
    availableForUseDate: "2020-07-01",
    costExGstCents: 10_000_000,
    usefulLifeYears: 10,
    method: "prime_cost",
    privateUsePercent: 0,
  });

  saveAssetOpeningBalance({
    assetId,
    accumulatedDepreciationCents: 4_000_000,
    bookValueCents: 6_000_000,
    asOfDate: "2026-06-30",
    sourceDescription: "会计 FY2025–26 底稿",
    enteredBy: "self",
    enteredAt: "2026-08-29",
  });

  const summary = getAssetDepreciationSummary(assetId, "FY2026-27");
  expect(summary.openingBookValueCents).toBe(6_000_000);
  expect(summary.totalDepreciationCents).toBe(1_000_000);
  expect(summary.closingBookValueCents).toBe(5_000_000);
  expect(getRawDb().prepare("SELECT category, amount_cents, as_of_date, source_description FROM opening_balances WHERE reference_id = ? ORDER BY category").all(`asset:${assetId}`)).toEqual([
    { category: "asset_accumulated_depreciation", amount_cents: 4_000_000, as_of_date: "2026-06-30", source_description: "会计 FY2025–26 底稿" },
    { category: "asset_book_value", amount_cents: 6_000_000, as_of_date: "2026-06-30", source_description: "会计 FY2025–26 底稿" },
  ]);
  expect(getRawDb().prepare("SELECT target_type, target_id, reason FROM audit_log WHERE target_type = 'asset_opening_balance'").all()).toEqual([
    { target_type: "asset_opening_balance", target_id: String(assetId), reason: "录入/更新 30 Jun 2026 资产期初累计折旧与账面余额" },
  ]);
});

test("disposal-year depreciation is prorated through the disposal date", () => {
  const assetId = createAsset({
    entityId: "boyun_co",
    name: "Disposed equipment",
    assetType: "equipment",
    purchaseDate: "2026-07-01",
    availableForUseDate: "2026-07-01",
    costExGstCents: 1_000_000,
    usefulLifeYears: 5,
    method: "prime_cost",
    privateUsePercent: 0,
  });
  getRawDb().prepare("UPDATE assets SET disposal_date = ?, disposal_amount_cents = ? WHERE id = ?").run("2026-12-31", 500_000, assetId);

  const summary = getAssetDepreciationSummary(assetId, "FY2026-27");
  expect(summary.totalDepreciationCents).toBe(100_822);
  expect(summary.closingBookValueCents).toBe(899_178);
});

test("missing pre-cutover opening values produce no depreciation amount", () => {
  const assetId = createAsset({
    entityId: "boyun_co",
    name: "Unconfigured opening equipment",
    assetType: "equipment",
    purchaseDate: "2020-07-01",
    availableForUseDate: "2020-07-01",
    costExGstCents: 10_000_000,
    usefulLifeYears: 10,
    method: "prime_cost",
    privateUsePercent: 0,
  });

  const summary = getAssetDepreciationSummary(assetId, "FY2026-27");

  expect(summary.status).toBe("manual_review");
  expect(summary.totalDepreciationCents).toBeNull();
  expect(summary.deductibleDepreciationCents).toBeNull();
  expect(summary.unresolvedReason).toContain("期初余额未配置");
});
