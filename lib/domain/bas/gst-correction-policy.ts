import { addDays, addMonths, addYears } from "date-fns";
import { assertIntegerCents } from "@/lib/money";
import { formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

/**
 * ATO GST-error policy verified on 27 Aug 2026 for the entities in this app
 * (GST turnover under $20m). The value limit is strict: the ATO rule says
 * the net debit error must be less than $12,500.
 */
export const GST_CORRECTION_POLICY = {
  turnoverBand: "under_20m",
  debitErrorValueLimitCents: 1_250_000,
  debitErrorTimeLimitMonths: 18,
  creditErrorReviewPeriodYears: 4,
  creditErrorReviewPeriodExtraDays: 1,
  sourceUrl: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/managing-gst-in-your-business/reporting-paying-and-activity-statements/correcting-gst-errors",
  determinationUrl: "https://www.ato.gov.au/law/view/pdf/ldt/li2023-032.pdf",
  sourceRetrievedOn: "2026-08-27",
} as const;

export type GstCorrectionAssessment = {
  allowed: boolean;
  kind: "none" | "debit" | "credit";
  netGstDeltaCents: number;
  limitDate: DateOnly | null;
  reason: string | null;
};

export type GstCorrectionInput = {
  originalEffectiveDue: DateOnly;
  targetEffectiveDue: DateOnly;
  gstDeltaCents: number;
  /** The lodged date starts the ATO period-of-review clock for credit errors. */
  originalLodgedDate?: DateOnly | null;
};

function addCalendarMonths(date: DateOnly, months: number): DateOnly {
  return formatDateOnly(addMonths(parseMelbourneDate(date), months));
}

function addCalendarYearsAndDays(date: DateOnly, years: number, days: number): DateOnly {
  return formatDateOnly(addDays(addYears(parseMelbourneDate(date), years), days));
}

/**
 * Assesses the aggregate GST delta for a proposed include_current correction.
 * The target due date is used as the conservative planned lodgement date.
 */
export function assessGstCorrection(input: GstCorrectionInput): GstCorrectionAssessment {
  assertIntegerCents(input.gstDeltaCents);
  if (input.gstDeltaCents === 0) {
    return { allowed: true, kind: "none", netGstDeltaCents: 0, limitDate: null, reason: null };
  }

  const kind = input.gstDeltaCents > 0 ? "debit" : "credit";
  const limitDate = kind === "debit"
    ? addCalendarMonths(input.originalEffectiveDue, GST_CORRECTION_POLICY.debitErrorTimeLimitMonths)
    : addCalendarYearsAndDays(
      input.originalLodgedDate ?? input.originalEffectiveDue,
      GST_CORRECTION_POLICY.creditErrorReviewPeriodYears,
      GST_CORRECTION_POLICY.creditErrorReviewPeriodExtraDays,
    );

  if (input.targetEffectiveDue > limitDate) {
    const timeLimit = kind === "debit"
      ? `${GST_CORRECTION_POLICY.debitErrorTimeLimitMonths} 个月`
      : `${GST_CORRECTION_POLICY.creditErrorReviewPeriodYears} 年 + ${GST_CORRECTION_POLICY.creditErrorReviewPeriodExtraDays} 天审查期`;
    return {
      allowed: false,
      kind,
      netGstDeltaCents: input.gstDeltaCents,
      limitDate,
      reason: `更正时间超过 ATO 现行 ${timeLimit} 时限（最迟 ${limitDate}），必须修订原 BAS。`,
    };
  }

  if (kind === "debit" && input.gstDeltaCents >= GST_CORRECTION_POLICY.debitErrorValueLimitCents) {
    return {
      allowed: false,
      kind,
      netGstDeltaCents: input.gstDeltaCents,
      limitDate,
      reason: "更正 GST 金额达到或超过 ATO 现行 $12,500 上限（当前档位：GST turnover < $20m），必须修订原 BAS。",
    };
  }

  return { allowed: true, kind, netGstDeltaCents: input.gstDeltaCents, limitDate, reason: null };
}
