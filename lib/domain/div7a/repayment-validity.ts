import { differenceInCalendarDays } from "date-fns";
import { getRawDb } from "@/lib/db/client";
import { deriveFiscalPeriod } from "@/lib/ingest/transactions";
import { parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";
import {
  DEFAULT_DIV7A_S109R_WINDOW_DAYS,
  DIV7A_S109R_WINDOW_BASIS,
  DIV7A_S109R_WINDOW_SETTING_KEY,
} from "@/lib/domain/div7a/constants";

export {
  DEFAULT_DIV7A_S109R_WINDOW_DAYS,
  DIV7A_S109R_WINDOW_BASIS,
  DIV7A_S109R_WINDOW_SETTING_KEY,
} from "@/lib/domain/div7a/constants";

export type RepaymentReviewStatus = "unreviewed" | "confirmed_valid" | "excluded";

export type StoredDiv7aRepayment = {
  repaymentId: string;
  date: DateOnly;
  amountCents: number;
  reviewStatus: RepaymentReviewStatus;
};

export type RepaymentValidityRisk = {
  repaymentId: string;
  repaymentDate: DateOnly;
  amountCents: number;
  windowDays: number;
  reviewStatus: RepaymentReviewStatus;
  relatedTransactions: Array<{
    id: number;
    date: DateOnly;
    amountCents: number;
    description: string;
  }>;
  relatedLoans: Array<{
    id: number;
    loanDate: DateOnly;
    principalCents: number;
    borrower: string;
  }>;
  message: string;
};

function parseWindowDays(value: unknown): number {
  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    return DEFAULT_DIV7A_S109R_WINDOW_DAYS;
  }
  return days;
}

export function getSection109RWindowDays(): number {
  const row = getRawDb().prepare("SELECT value FROM settings WHERE key = ?").get(DIV7A_S109R_WINDOW_SETTING_KEY) as { value: string } | undefined;
  return parseWindowDays(row?.value);
}

export function parseSection109RWindowDays(value: unknown): number {
  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new Error("s109R 风险筛查窗口必须是 1 至 365 天的整数");
  }
  return days;
}

export function setSection109RWindowDays(value: unknown): number {
  const days = parseSection109RWindowDays(value);
  getRawDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(DIV7A_S109R_WINDOW_SETTING_KEY, String(days));
  return days;
}

function dateDistance(left: DateOnly, right: DateOnly) {
  return Math.abs(differenceInCalendarDays(parseMelbourneDate(left), parseMelbourneDate(right)));
}

function isReviewStatus(value: unknown): value is RepaymentReviewStatus {
  return value === "unreviewed" || value === "confirmed_valid" || value === "excluded";
}

export function detectRepaymentValidityRisks(input: {
  loanId: number;
  lenderEntityId: string;
  borrower: string;
  repayments: StoredDiv7aRepayment[];
  windowDays?: number;
}): RepaymentValidityRisk[] {
  const windowDays = input.windowDays ?? getSection109RWindowDays();
  const db = getRawDb();
  const transactions = db.prepare(`
    SELECT t.id, t.date, t.amount_cents, t.description
    FROM transactions t
    INNER JOIN accounts a ON a.id = t.account_id
    WHERE t.entity_id = ?
      AND t.counterparty = ?
      AND a.type = 'expense'
  `).all(input.lenderEntityId, input.borrower) as Array<{
    id: number;
    date: DateOnly;
    amount_cents: number;
    description: string;
  }>;
  const loans = db.prepare(`
    SELECT id, loan_date, principal_cents, borrower
    FROM div7a_loans
    WHERE lender_entity_id = ? AND borrower = ? AND id <> ?
  `).all(input.lenderEntityId, input.borrower, input.loanId) as Array<{
    id: number;
    loan_date: DateOnly;
    principal_cents: number;
    borrower: string;
  }>;

  return input.repayments.flatMap((repayment) => {
    if (repayment.amountCents <= 0) return [];
    const relatedTransactions = transactions
      .filter((transaction) =>
        dateDistance(repayment.date, transaction.date) <= windowDays
        && Math.abs(transaction.amount_cents) >= repayment.amountCents)
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        amountCents: Math.abs(transaction.amount_cents),
        description: transaction.description,
      }));
    const relatedLoans = loans
      .filter((loan) =>
        dateDistance(repayment.date, loan.loan_date) <= windowDays
        && loan.principal_cents >= repayment.amountCents)
      .map((loan) => ({
        id: loan.id,
        loanDate: loan.loan_date,
        principalCents: loan.principal_cents,
        borrower: loan.borrower,
      }));
    if (relatedTransactions.length === 0 && relatedLoans.length === 0) return [];
    const reviewStatus = isReviewStatus(repayment.reviewStatus) ? repayment.reviewStatus : "unreviewed";
    return [{
      repaymentId: repayment.repaymentId,
      repaymentDate: repayment.date,
      amountCents: repayment.amountCents,
      windowDays,
      reviewStatus,
      relatedTransactions,
      relatedLoans,
      message: "还款有效性存疑 · 请核对 s109R",
    } satisfies RepaymentValidityRisk];
  });
}

export function repaymentCountsForMinimum(repayment: StoredDiv7aRepayment, risks: RepaymentValidityRisk[]) {
  const risk = risks.find((item) => item.repaymentId === repayment.repaymentId);
  return !risk || risk.reviewStatus === "confirmed_valid";
}

export function qualifiedRepaymentCentsForIncomeYear(
  repayments: StoredDiv7aRepayment[],
  incomeYear: string,
  risks: RepaymentValidityRisk[],
) {
  const normalized = incomeYear.replace(/^FY/, "");
  return repayments
    .filter((repayment) => deriveFiscalPeriod(repayment.date).fy === normalized)
    .filter((repayment) => repaymentCountsForMinimum(repayment, risks))
    .reduce((total, repayment) => total + repayment.amountCents, 0);
}
