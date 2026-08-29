import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { createAsset, getAssetSchedule, listAssets, recordAssetDisposal, saveAssetOpeningBalance } from "@/lib/domain/assets/service";

export const dynamic = "force-dynamic";

const assetType = z.enum(["vehicle", "equipment", "other"]);
const method = z.enum(["prime_cost", "diminishing_value"]);

const createSchema = z.object({
  action: z.literal("create"),
  entityId: z.string().min(1),
  name: z.string().min(1),
  assetType: assetType.nullable().optional(),
  purchaseDate: z.string().min(1),
  availableForUseDate: z.string().nullable().optional(),
  costExGstCents: z.number().int().optional(),
  costExGst: z.string().optional(),
  usefulLifeYears: z.number().int().positive().nullable().optional(),
  method: method.nullable().optional(),
  privateUsePercent: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
}).strict().refine((value) => value.costExGstCents !== undefined || value.costExGst !== undefined, {
  message: "costExGst or costExGstCents is required",
  path: ["costExGstCents"],
});

const openingSchema = z.object({
  action: z.literal("opening_balance"),
  assetId: z.number().int().positive(),
  accumulatedDepreciationCents: z.number().int().nonnegative().optional(),
  accumulatedDepreciation: z.string().optional(),
  bookValueCents: z.number().int().nonnegative().optional(),
  bookValue: z.string().optional(),
  asOfDate: z.string().min(1),
  sourceDescription: z.string().min(1),
  enteredBy: z.string().min(1),
  enteredAt: z.string().min(1),
  notes: z.string().nullable().optional(),
}).strict().refine((value) => value.accumulatedDepreciationCents !== undefined || value.accumulatedDepreciation !== undefined, {
  message: "accumulated depreciation is required",
  path: ["accumulatedDepreciationCents"],
}).refine((value) => value.bookValueCents !== undefined || value.bookValue !== undefined, {
  message: "book value is required",
  path: ["bookValueCents"],
});

const disposalSchema = z.object({
  action: z.literal("disposal"),
  assetId: z.number().int().positive(),
  disposalDate: z.string().min(1),
  disposalAmountCents: z.number().int().nonnegative().optional(),
  disposalAmount: z.string().optional(),
}).strict().refine((value) => value.disposalAmountCents !== undefined || value.disposalAmount !== undefined, {
  message: "disposalAmount or disposalAmountCents is required",
  path: ["disposalAmountCents"],
});

function incomeYearPlus(value: string, years: number) {
  const normalized = value.trim().replace(/^FY/, "");
  const start = Number(normalized.slice(0, 4)) + years;
  return `FY${start}-${String(start + 1).slice(-2)}`;
}

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const entityId = url.searchParams.get("entityId") ?? undefined;
    const incomeYear = url.searchParams.get("fy") ?? "FY2026-27";
    const assets = listAssets(entityId).map((asset) => ({
      asset,
      schedule: getAssetSchedule(asset.id, incomeYear, incomeYearPlus(incomeYear, 4)),
    }));
    return Response.json({ assets });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "资产数据暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as unknown;
    if (typeof body === "object" && body !== null && "action" in body && body.action === "create") {
      const parsed = createSchema.parse(body);
      const costExGstCents = parsed.costExGstCents ?? parseMoneyToCents(parsed.costExGst as string);
      return Response.json({ id: createAsset({ ...parsed, costExGstCents }) }, { status: 201 });
    }
    if (typeof body === "object" && body !== null && "action" in body && body.action === "opening_balance") {
      const parsed = openingSchema.parse(body);
      const accumulatedDepreciationCents = parsed.accumulatedDepreciationCents ?? parseMoneyToCents(parsed.accumulatedDepreciation as string);
      const bookValueCents = parsed.bookValueCents ?? parseMoneyToCents(parsed.bookValue as string);
      saveAssetOpeningBalance({ ...parsed, accumulatedDepreciationCents, bookValueCents });
      return Response.json({ ok: true });
    }
    const parsed = disposalSchema.parse(body);
    const disposalAmountCents = parsed.disposalAmountCents ?? parseMoneyToCents(parsed.disposalAmount as string);
    recordAssetDisposal({ ...parsed, disposalAmountCents });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "资产保存失败" }, { status: 400 });
  }
}

