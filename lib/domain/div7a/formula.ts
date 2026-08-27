import Decimal from "decimal.js";
import { assertIntegerCents } from "@/lib/money";

export type Div7aRepaymentInput = {
  principalCents: number;
  benchmarkRate: string;
  remainingTermYears: number;
  loanIncomeYear: string;
  assessmentIncomeYear: string;
};

function normalizeIncomeYear(value: string) {
  const normalized = value.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid income year: ${value}`);
  return normalized;
}

function parseRate(value: string) {
  const normalized = value.trim();
  const rate = new Decimal(normalized.endsWith("%") ? normalized.slice(0, -1).trim() : normalized);
  const decimalRate = normalized.endsWith("%") ? rate.div(100) : rate;
  if (!decimalRate.isFinite() || decimalRate.isNegative() || decimalRate.greaterThanOrEqualTo(1)) {
    throw new Error("Benchmark rate must be a manually entered value between 0 and 1");
  }
  return decimalRate;
}

export function calculateMinimumYearlyRepaymentCents(input: Div7aRepaymentInput): number {
  assertIntegerCents(input.principalCents);
  if (input.principalCents <= 0) throw new Error("Principal must be positive");
  if (!Number.isSafeInteger(input.remainingTermYears) || input.remainingTermYears < 1 || input.remainingTermYears > 25) {
    throw new Error("Remaining term must be an integer between 1 and 25 years");
  }
  const loanIncomeYear = normalizeIncomeYear(input.loanIncomeYear);
  const assessmentIncomeYear = normalizeIncomeYear(input.assessmentIncomeYear);
  const rate = parseRate(input.benchmarkRate);

  // Division 7A starts the minimum yearly repayment schedule in the year
  // after the loan is made. No shortfall is reported in the origination year.
  if (loanIncomeYear === assessmentIncomeYear) return 0;

  const principal = new Decimal(input.principalCents);
  const term = new Decimal(input.remainingTermYears);
  const repayment = rate.isZero()
    ? principal.div(term)
    : principal.mul(rate).div(new Decimal(1).minus(new Decimal(1).plus(rate).pow(input.remainingTermYears * -1)));
  const cents = repayment.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  assertIntegerCents(cents);
  return cents;
}
