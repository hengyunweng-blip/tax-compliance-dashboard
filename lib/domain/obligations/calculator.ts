import { addDays, addMonths } from "date-fns";
import { adjustConfiguredMelbourneBusinessDay } from "@/lib/time/business-days";
import type { AdjustmentDirection } from "@/lib/domain/obligations/rules";
import { formatDateOnly, parseMelbourneDate, todayInMelbourne, type DateOnly } from "@/lib/time/melbourne";

export type BasQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export type DueDateResult = {
  incomeYear: string;
  deadlineFy: string;
  statutoryDue: DateOnly;
  effectiveDue: DateOnly | null;
  windowOpens?: DateOnly;
};

function fyLabel(fy: string) {
  return fy.startsWith("FY") ? fy : `FY${fy}`;
}

function financialYearStart(value: string) {
  const normalized = fyLabel(value).replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid financial year: ${value}`);
  return Number(normalized.slice(0, 4));
}

function isoDate(year: number, month: number, day: number): DateOnly {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as DateOnly;
}

function addMelbourneDays(date: DateOnly, days: number): DateOnly {
  return formatDateOnly(addDays(parseMelbourneDate(date), days));
}

export function calculateBasDueDates(fy: string, quarter: BasQuarter, adjustmentDirection: AdjustmentDirection = "forward"): DueDateResult {
  const startYear = financialYearStart(fy);
  const statutoryDue = quarter === "Q1"
    ? isoDate(startYear, 10, 28)
    : quarter === "Q2"
      ? isoDate(startYear + 1, 2, 28)
      : quarter === "Q3"
        ? isoDate(startYear + 1, 4, 28)
        : isoDate(startYear + 1, 7, 28);
  // Q2 is an explicit exception: Simpler BAS self-lodgement does not add the
  // usual two-week extension for this quarter.
  const extendedDate = addMelbourneDays(statutoryDue, quarter === "Q2" ? 0 : 14);
  return {
    incomeYear: fyLabel(fy),
    deadlineFy: fyLabel(fy),
    statutoryDue,
    effectiveDue: adjustConfiguredMelbourneBusinessDay(extendedDate, adjustmentDirection),
  };
}

export type AnnualTaxEntity = {
  type: "company" | "trust" | "individual";
  priorYearReturnOutstanding?: boolean;
};

export function calculateAnnualTaxDue(entity: AnnualTaxEntity, context: { fy: string }, adjustmentDirection: AdjustmentDirection = "forward"): DueDateResult {
  const deadlineStartYear = financialYearStart(context.fy);
  const incomeYear = incomeYearForStart(deadlineStartYear - 1);
  const statutoryDue: DateOnly = entity.type === "company" && !entity.priorYearReturnOutstanding
    ? isoDate(deadlineStartYear + 1, 2, 28)
    : isoDate(deadlineStartYear, 10, 31);

  return {
    incomeYear,
    deadlineFy: fyLabel(context.fy),
    statutoryDue,
    effectiveDue: adjustConfiguredMelbourneBusinessDay(statutoryDue, adjustmentDirection),
  };
}

export function calculateTrustDistributionDue(statutoryDue: DateOnly = "2027-06-30", adjustmentDirection: AdjustmentDirection = "backward"): DueDateResult {
  const incomeYear = financialYearForDate(statutoryDue);
  return {
    incomeYear,
    deadlineFy: incomeYear,
    statutoryDue,
    effectiveDue: adjustConfiguredMelbourneBusinessDay(statutoryDue, adjustmentDirection),
  };
}

export function calculateAsicAnnualReviewDue(asicReviewDate: DateOnly, fy: string, adjustmentDirection: AdjustmentDirection = "forward"): DueDateResult {
  const statutoryDue = formatDateOnly(addMonths(parseMelbourneDate(annualOccurrence(asicReviewDate, fy)), 2));
  return {
    incomeYear: fyLabel(fy),
    deadlineFy: fyLabel(fy),
    statutoryDue,
    effectiveDue: adjustConfiguredMelbourneBusinessDay(statutoryDue, adjustmentDirection),
  };
}

export function calculateLicenceWindowDue(anniversaryDate: DateOnly, fy: string, adjustmentDirection: AdjustmentDirection = "backward"): DueDateResult {
  const annualAnniversary = annualOccurrence(anniversaryDate, fy);
  const windowOpens = formatDateOnly(addDays(parseMelbourneDate(annualAnniversary), -42));
  return {
    incomeYear: fyLabel(fy),
    deadlineFy: fyLabel(fy),
    windowOpens,
    statutoryDue: annualAnniversary,
    effectiveDue: adjustConfiguredMelbourneBusinessDay(annualAnniversary, adjustmentDirection),
  };
}

export function calculateSuperContributionDue(statutoryDue: DateOnly = "2027-06-30", adjustmentDirection: AdjustmentDirection = "backward"): DueDateResult {
  const incomeYear = financialYearForDate(statutoryDue);
  return {
    incomeYear,
    deadlineFy: incomeYear,
    statutoryDue,
    effectiveDue: adjustConfiguredMelbourneBusinessDay(statutoryDue, adjustmentDirection),
  };
}

/**
 * A notice of intent is a separate user task. Its default review deadline is
 * the individual return deadline; it is never inferred from payment status.
 */
export function calculateSuperNoticeDue(fy: string, adjustmentDirection: AdjustmentDirection = "forward"): DueDateResult {
  return calculateAnnualTaxDue({ type: "individual" }, { fy }, adjustmentDirection);
}

export function calculateLicenceCancellationDate(anniversaryDate: DateOnly): DateOnly {
  return formatDateOnly(addDays(parseMelbourneDate(anniversaryDate), 21));
}

export function financialYearForDate(date: DateOnly): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return `FY${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function currentFinancialYear(now = new Date()): string {
  return financialYearForDate(todayInMelbourne(now));
}

function incomeYearForStart(startYear: number) {
  return `FY${startYear}-${String(startYear + 1).slice(-2)}`;
}

function annualOccurrence(baseDate: DateOnly, fy: string): DateOnly {
  const startYear = financialYearStart(fy);
  const month = Number(baseDate.slice(5, 7));
  const year = month >= 7 ? startYear : startYear + 1;
  return isoDate(year, month, Number(baseDate.slice(8, 10)));
}
