import { assertIntegerCents } from "@/lib/money";
import type { DateOnly } from "@/lib/time/melbourne";
import type { BasLineItem } from "@/lib/domain/bas/generator";

const STORED_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type PriorPeriodCorrectionSummary = {
  count: number;
  totalAmountCents: number;
  periodLabels: string[];
  worksheetIds: number[];
};

export function storedLodgedDateOnly(value: string | null): DateOnly | null {
  const canonical = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? "")?.[1];
  if (canonical) return canonical as DateOnly;
  const match = /^(\d{2}) ([A-Za-z]{3}) (\d{4})/.exec(value ?? "");
  if (!match) return null;
  const month = STORED_MONTHS.indexOf(match[2] as typeof STORED_MONTHS[number]) + 1;
  return month < 1 ? null : `${match[3]}-${String(month).padStart(2, "0")}-${match[1]}` as DateOnly;
}

export function displayBasPeriodLabel(value: string): string {
  return value.replace(/(\d{4})-(\d{2})/, "$1–$2");
}

export function summarizePriorPeriodCorrections(lines: BasLineItem[]): PriorPeriodCorrectionSummary {
  const corrections = lines.filter((line) => line.isPriorPeriodCorrection);
  const periodLabels = [...new Set(corrections.map((line) => line.originalPeriodLabel).filter((value): value is string => Boolean(value)))].sort();
  const worksheetIds = [...new Set(corrections.map((line) => line.originalWorksheetId).filter((value): value is number => Number.isSafeInteger(value)))].sort((left, right) => left - right);
  const totalAmountCents = corrections.reduce((total, line) => total + line.amountCents, 0);
  assertIntegerCents(totalAmountCents);
  return { count: corrections.length, totalAmountCents, periodLabels, worksheetIds };
}
