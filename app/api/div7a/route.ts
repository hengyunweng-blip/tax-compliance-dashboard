import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { createDiv7aLoan, getDiv7aLoanSummary, listDiv7aLoans, recordDiv7aRepayment } from "@/lib/domain/div7a/service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("create"),
  lenderEntityId: z.string().min(1),
  borrower: z.string().min(1),
  loanDate: z.string().min(1),
  principalCents: z.number().int().optional(),
  principal: z.string().optional(),
  termYears: z.number().int().min(1).max(25),
  benchmarkRate: z.string().min(1),
  agreementSigned: z.boolean().optional(),
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

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fy = url.searchParams.get("fy") ?? "2026-27";
    const loanId = url.searchParams.get("loanId");
    const loans = listDiv7aLoans();
    return Response.json({ loans: loanId ? loans.filter((loan) => loan.id === Number(loanId)).map((loan) => getDiv7aLoanSummary(loan.id, fy)) : loans.map((loan) => getDiv7aLoanSummary(loan.id, fy)) });
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
    const parsed = repaymentSchema.parse(body);
    const amountCents = parsed.amountCents ?? parseMoneyToCents(parsed.amount as string);
    recordDiv7aRepayment({ ...parsed, amountCents });
    return Response.json({ loans: listDiv7aLoans() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Div 7A 保存失败" }, { status: 400 });
  }
}
