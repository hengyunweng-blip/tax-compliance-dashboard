import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { getSuperProgress, markSuperNoticeSubmitted, recordSuperContribution } from "@/lib/domain/super/service";

export const dynamic = "force-dynamic";

const contributionSchema = z.object({
  action: z.literal("contribution"),
  person: z.string().min(1),
  fy: z.string().min(1),
  amountCents: z.number().int().optional(),
  amount: z.string().optional(),
  paidAt: z.string().nullable().optional(),
}).strict().refine((value) => value.amountCents !== undefined || value.amount !== undefined, {
  message: "amount or amountCents is required",
  path: ["amountCents"],
});

const noticeSchema = z.object({
  action: z.literal("notice"),
  person: z.string().min(1),
  fy: z.string().min(1),
  submittedAt: z.string().min(1),
}).strict();

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const person = url.searchParams.get("person") ?? "self";
    const fy = url.searchParams.get("fy") ?? "2026-27";
    return Response.json({ progress: getSuperProgress(person, fy) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "养老金数据暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as unknown;
    if (typeof body === "object" && body !== null && "action" in body && body.action === "notice") {
      const parsed = noticeSchema.parse(body);
      return Response.json({ progress: markSuperNoticeSubmitted(parsed) });
    }
    const parsed = contributionSchema.parse(body);
    const amountCents = parsed.amountCents ?? parseMoneyToCents(parsed.amount as string);
    return Response.json({ progress: recordSuperContribution({ ...parsed, amountCents }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "养老金记录保存失败" }, { status: 400 });
  }
}
