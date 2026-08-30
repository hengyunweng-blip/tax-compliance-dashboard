import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { createDiv7aLoan, getDiv7aLoanSchedule, getDiv7aLoanSummary, listDiv7aLoans, recordDiv7aRepayment, reviewDiv7aRepayment } from "@/lib/domain/div7a/service";
import { saveDiv7aAgreement, saveDiv7aOpeningBalance } from "@/lib/domain/div7a/opening-balances";
import { currentFinancialYear } from "@/lib/domain/obligations/calculator";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("create"),
  lenderEntityId: z.string().min(1),
  borrower: z.string().min(1),
  loanDate: z.string().min(1),
  principalCents: z.number().int().optional(),
  principal: z.string().optional(),
  termYears: z.number().int().min(1).max(25),
  benchmarkRate: z.string().optional(),
  agreementSigned: z.boolean().optional(),
  securityType: z.enum(["unsecured", "registered_mortgage", "unknown"]).optional(),
}).strict().refine((value) => value.principalCents !== undefined || value.principal !== undefined, {
  message: "principal or principalCents is required",
  path: ["principalCents"],
});

const repaymentSchema = z.object({
  action: z.literal("repayment"),
  loanId: z.number().int().positive(),
  date: z.string().min(1),
  amountCents: z.number().int().optional(),
  amount: z.string().optional(),
}).strict().refine((value) => value.amountCents !== undefined || value.amount !== undefined, {
  message: "amount or amountCents is required",
  path: ["amountCents"],
});

const repaymentReviewSchema = z.object({
  action: z.literal("repayment_review"),
  loanId: z.number().int().positive(),
  repaymentId: z.string().min(1),
  decision: z.enum(["confirmed_valid", "excluded"]),
  reason: z.string().trim().max(500).optional(),
}).strict();

const openingBalanceSchema = z.object({
  action: z.literal("opening_balance"),
  loanId: z.number().int().positive(),
  balanceCents: z.number().int().nonnegative().optional(),
  balance: z.string().optional(),
  asOfDate: z.string().min(1),
  originalIncomeYear: z.string().min(1),
  originalTermYears: z.number().int().min(1).max(25),
  securityType: z.enum(["unsecured", "registered_mortgage", "unknown"]),
  agreementTermsStatus: z.enum(["unknown", "compliant", "not_compliant", "needs_review"]),
  agreementRateText: z.string().nullable().optional(),
  agreementSignedAt: z.string().nullable().optional(),
  agreementDocumentId: z.number().int().positive().nullable().optional(),
  sourceDescription: z.string().min(1),
  enteredBy: z.string().min(1),
  enteredAt: z.string().min(1),
  notes: z.string().nullable().optional(),
}).strict().refine((value) => value.balanceCents !== undefined || value.balance !== undefined, {
  message: "balance or balanceCents is required",
  path: ["balanceCents"],
});

const agreementSchema = z.object({
  action: z.literal("agreement"),
  loanId: z.number().int().positive(),
  agreementSignedAt: z.string().nullable(),
  agreementDocumentId: z.number().int().positive().nullable(),
  agreementRateText: z.string().nullable(),
  agreementTermsStatus: z.enum(["unknown", "compliant", "not_compliant", "needs_review"]),
  securityType: z.enum(["unsecured", "registered_mortgage", "unknown"]),
}).strict();

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fy = url.searchParams.get("fy") ?? currentFinancialYear();
    const loanId = url.searchParams.get("loanId");
    const loans = listDiv7aLoans();
    const selected = loanId ? loans.filter((loan) => loan.id === Number(loanId)) : loans;
    return Response.json({ loans: selected.map((loan) => ({
      ...getDiv7aLoanSummary(loan.id, fy),
      schedule: getDiv7aLoanSchedule(loan.id, fy),
    })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Div 7A 暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as unknown;
    if (typeof body === "object" && body !== null && "action" in body && body.action === "create") {
      const parsed = createSchema.parse(body);
      const principalCents = parsed.principalCents ?? parseMoneyToCents(parsed.principal as string);
      const id = createDiv7aLoan({ ...parsed, principalCents });
      return Response.json({ id }, { status: 201 });
    }
    if (typeof body === "object" && body !== null && "action" in body && body.action === "opening_balance") {
      const parsed = openingBalanceSchema.parse(body);
      const balanceCents = parsed.balanceCents ?? parseMoneyToCents(parsed.balance as string);
      const openingBalance = saveDiv7aOpeningBalance({ ...parsed, balanceCents });
      return Response.json({ openingBalance });
    }
    if (typeof body === "object" && body !== null && "action" in body && body.action === "agreement") {
      const parsed = agreementSchema.parse(body);
      saveDiv7aAgreement(parsed);
      return Response.json({ loans: listDiv7aLoans() });
    }
    if (typeof body === "object" && body !== null && "action" in body && body.action === "repayment_review") {
      const parsed = repaymentReviewSchema.parse(body);
      reviewDiv7aRepayment(parsed);
      return Response.json({ loans: listDiv7aLoans() });
    }
    const parsed = repaymentSchema.parse(body);
    const amountCents = parsed.amountCents ?? parseMoneyToCents(parsed.amount as string);
    const repayment = recordDiv7aRepayment({ ...parsed, amountCents });
    return Response.json({ repaymentId: repayment.repaymentId, loans: listDiv7aLoans() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Div 7A 保存失败" }, { status: 400 });
  }
}
