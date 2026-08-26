import { addDays, addMonths } from "date-fns";
import { adjustMelbourneBusinessDay } from "@/lib/time/business-days";
import type { AdjustmentDirection } from "@/lib/domain/obligations/rules";
import { formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export type BasQuarter = "Q1" | "Q2" | "Q3" | "Q4";

type DueDateResult = {
  incomeYear: string;
  deadlineFy: string;
  statutoryDue: DateOnly;
  effectiveDue: DateOnly;
  windowOpens?: DateOnly;
};

const BAS_DUE_DATES: Record<string, Record<BasQuarter, { statutoryDue: DateOnly; extensionDays: number }>> = {
  "2026-27": {
    Q1: { statutoryDue: "2026-10-28", extensionDays: 14 },
    Q2: { statutoryDue: "2027-02-28", extensionDays: 0 },
    Q3: { statutoryDue: "2027-04-28", extensionDays: 14 },
    Q4: { statutoryDue: "2027-07-28", extensionDays: 14 },
  },
};

function fyLabel(fy: string) {
  return fy.startsWith("FY") ? fy : `FY${fy}`;
}

function addMelbourneDays(date: DateOnly, days: number): DateOnly {
  return formatDateOnly(addDays(parseMelbourneDate(date), days));
}

export function calculateBasDueDates(fy: string, quarter: BasQuarter, adjustmentDirection: AdjustmentDirection = "forward"): DueDateResult {
  const dates = BAS_DUE_DATES[fy.replace(/^FY/, "")];
  if (!dates) {
    throw new Error(`Unsupported BAS financial year: ${fy}`);
  }
  const rule = dates[quarter];
  if (!rule) {
    throw new Error(`Unsupported BAS quarter: ${quarter}`);
  }

  const statutoryDue = rule.statutoryDue;
  const extendedDate = addMelbourneDays(statutoryDue, rule.extensionDays);
  return {
    incomeYear: fyLabel(fy),
    deadlineFy: fyLabel(fy),
    statutoryDue,
    effectiveDue: adjustMelbourneBusinessDay(extendedDate, adjustmentDirection),
  };
}

export type AnnualTaxEntity = {
  type: "company" | "trust" | "individual";
  priorYearReturnOutstanding?: boolean;
};

export function calculateAnnualTaxDue(entity: AnnualTaxEntity, context: { fy: string }, adjustmentDirection: AdjustmentDirection = "forward"): DueDateResult {
  if (context.fy.replace(/^FY/, "") !== "2026-27") {
    throw new Error(`Unsupported annual tax financial year: ${context.fy}`);
  }

  const statutoryDue: DateOnly = entity.type === "company" && !entity.priorYearReturnOutstanding
    ? "2027-02-28"
    : "2026-10-31";

  return {
    incomeYear: "FY2025-26",
    deadlineFy: "FY2026-27",
    statutoryDue,
    effectiveDue: adjustMelbourneBusinessDay(statutoryDue, adjustmentDirection),
  };
}

export function calculateTrustDistributionDue(statutoryDue: DateOnly = "2027-06-30", adjustmentDirection: AdjustmentDirection = "backward"): DueDateResult {
  const incomeYear = financialYearForDate(statutoryDue);
  return {
    incomeYear,
    deadlineFy: incomeYear,
    statutoryDue,
    effectiveDue: adjustMelbourneBusinessDay(statutoryDue, adjustmentDirection),
  };
}

export function calculateAsicAnnualReviewDue(asicReviewDate: DateOnly, fy: string, adjustmentDirection: AdjustmentDirection = "forward"): DueDateResult {
  const statutoryDue = formatDateOnly(addMonths(parseMelbourneDate(asicReviewDate), 2));
  return {
    incomeYear: fyLabel(fy),
    deadlineFy: fyLabel(fy),
    statutoryDue,
    effectiveDue: adjustMelbourneBusinessDay(statutoryDue, adjustmentDirection),
  };
}

export function calculateLicenceWindowDue(anniversaryDate: DateOnly, fy: string, adjustmentDirection: AdjustmentDirection = "backward"): DueDateResult {
  const windowOpens = formatDateOnly(addDays(parseMelbourneDate(anniversaryDate), -42));
  return {
    incomeYear: fyLabel(fy),
    deadlineFy: fyLabel(fy),
    windowOpens,
    statutoryDue: anniversaryDate,
    effectiveDue: adjustMelbourneBusinessDay(anniversaryDate, adjustmentDirection),
  };
}

export function calculateSuperContributionDue(statutoryDue: DateOnly = "2027-06-30", adjustmentDirection: AdjustmentDirection = "backward"): DueDateResult {
  const incomeYear = financialYearForDate(statutoryDue);
  return {
    incomeYear,
    deadlineFy: incomeYear,
    statutoryDue,
    effectiveDue: adjustMelbourneBusinessDay(statutoryDue, adjustmentDirection),
  };
}

export function calculateLicenceCancellationDate(anniversaryDate: DateOnly): DateOnly {
  return formatDateOnly(addDays(parseMelbourneDate(anniversaryDate), 21));
}

function financialYearForDate(date: DateOnly): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return `FY${startYear}-${String(startYear + 1).slice(-2)}`;
}
