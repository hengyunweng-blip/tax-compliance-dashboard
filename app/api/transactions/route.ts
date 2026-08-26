import { z } from "zod";
import { GST_CODES } from "@/lib/constants/gst";
import { parseMoneyToCents } from "@/lib/money";
import { createTransaction, listTransactions } from "@/lib/ingest/transactions";

export const dynamic = "force-dynamic";

const transactionSchema = z.object({
  entityId: z.string().min(1),
  date: z.string().min(1),
  description: z.string().min(1),
  counterparty: z.string().nullable().optional(),
  accountId: z.number().int().positive().optional(),
  accountCode: z.string().min(1).optional(),
  gstCode: z.enum(GST_CODES),
  amountCents: z.number().optional(),
  amount: z.string().optional(),
  gstCents: z.number().optional(),
  gst: z.string().optional(),
  source: z.string().optional(),
  documentId: z.number().int().positive().nullable().optional(),
  reviewFlag: z.boolean().optional(),
  notes: z.string().nullable().optional(),
}).strict().refine((value) => value.amountCents !== undefined || value.amount !== undefined, {
  message: "amount or amountCents is required",
  path: ["amountCents"],
});

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json({ transactions: listTransactions({
      entityId: url.searchParams.get("entityId") ?? undefined,
      fy: url.searchParams.get("fy") ?? undefined,
      quarter: url.searchParams.get("quarter") ?? undefined,
    }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "交易暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = transactionSchema.parse(await request.json());
    const amountCents = body.amountCents ?? parseMoneyToCents(body.amount as string);
    const gstCents = body.gstCents ?? (body.gst === undefined ? undefined : parseMoneyToCents(body.gst));
    const transaction = createTransaction({
      entityId: body.entityId,
      date: body.date,
      description: body.description,
      counterparty: body.counterparty,
      accountId: body.accountId,
      accountCode: body.accountCode,
      gstCode: body.gstCode,
      amountCents,
      gstCents,
      source: body.source,
      documentId: body.documentId,
      reviewFlag: body.reviewFlag,
      notes: body.notes,
    });
    return Response.json({ transaction }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "交易保存失败" }, { status: 400 });
  }
}
