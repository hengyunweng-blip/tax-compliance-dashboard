import { differenceInCalendarDays } from "date-fns";
import Decimal from "decimal.js";
import { assertIntegerCents } from "@/lib/money";
import { parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export type AssetMethod = "prime_cost" | "diminishing_value";

export type AssetDepreciationInput = {
  costExGstCents: number;
  openingBookValueCents: number;
  usefulLifeYears: number;
  method: AssetMethod;
  periodStart: DateOnly;
  periodEnd: DateOnly;
  availableForUseDate: DateOnly;
  disposalDate: DateOnly | null;
};

export function fiscalYearBounds(incomeYear: string): { start: DateOnly; end: DateOnly } {
  const normalized = incomeYear.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid income year: ${incomeYear}`);
  const startYear = Number(normalized.slice(0, 4));
  return {
    start: `${startYear}-07-01` as DateOnly,
    end: `${startYear + 1}-06-30` as DateOnly,
  };
}

export function inclusiveDays(start: DateOnly, end: DateOnly): number {
  if (start > end) return 0;
  return differenceInCalendarDays(parseMelbourneDate(end), parseMelbourneDate(start)) + 1;
}

function decimalToCents(value: Decimal) {
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const result = rounded.toNumber();
  assertIntegerCents(result);
  return result;
}

export function calculateAssetDepreciationCents(input: AssetDepreciationInput): number {
  assertIntegerCents(input.costExGstCents);
  assertIntegerCents(input.openingBookValueCents);
  if (input.openingBookValueCents <= 0) return 0;
  const activeStart = input.availableForUseDate > input.periodStart ? input.availableForUseDate : input.periodStart;
  const activeEnd = input.disposalDate && input.disposalDate < input.periodEnd ? input.disposalDate : input.periodEnd;
  const activeDays = inclusiveDays(activeStart, activeEnd);
  if (activeDays <= 0) return 0;
  const periodDays = inclusiveDays(input.periodStart, input.periodEnd);
  const annualAmount = input.method === "prime_cost"
    ? new Decimal(input.costExGstCents).div(input.usefulLifeYears)
    : new Decimal(input.openingBookValueCents).mul(2).div(input.usefulLifeYears);
  const prorated = annualAmount.mul(activeDays).div(periodDays);
  return Math.min(input.openingBookValueCents, Math.max(0, decimalToCents(prorated)));
}

export function calculateDeductibleDepreciationCents(totalDepreciationCents: number, privateUsePercent: number): number {
  assertIntegerCents(totalDepreciationCents);
  if (!Number.isSafeInteger(privateUsePercent) || privateUsePercent < 0 || privateUsePercent > 100) {
    throw new Error("Private use percentage must be an integer from 0 to 100");
  }
  return decimalToCents(new Decimal(totalDepreciationCents).mul(100 - privateUsePercent).div(100));
}

