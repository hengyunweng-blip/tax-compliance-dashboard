import { exportBasCsv, exportBasPdf } from "@/lib/domain/bas/export";
import { BasGenerationError, generateBasWorksheet, getBasWorksheetByObligation, markBasLodged, updateBasPaygInstalment } from "@/lib/domain/bas/generator";
import { getObligationById } from "@/lib/domain/obligations/repository";
import { runMigrations } from "@/lib/db/migrate";

export const dynamic = "force-dynamic";

function parseObligationId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid BAS obligation ID");
  return id;
}

function errorResponse(error: unknown) {
  if (error instanceof BasGenerationError) {
    return Response.json({ error: error.message, warnings: error.warnings, pendingTransactionIds: error.pendingTransactionIds }, { status: error.pendingTransactionIds.length ? 409 : 400 });
  }
  return Response.json({ error: error instanceof Error ? error.message : "BAS 操作失败" }, { status: 400 });
}

export async function GET(request: Request, { params }: { params: Promise<{ obligationId: string }> }) {
  try {
    runMigrations();
    const obligationId = parseObligationId((await params).obligationId);
    const worksheet = getBasWorksheetByObligation(obligationId);
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    if (format === "csv" || format === "pdf") {
      if (!worksheet) return Response.json({ error: "BAS 底稿不存在" }, { status: 404 });
      return format === "csv" ? exportBasCsv(worksheet.id) : exportBasPdf(worksheet.id);
    }
    return Response.json({ obligation: getObligationById(obligationId), worksheet });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ obligationId: string }> }) {
  try {
    const obligationId = parseObligationId((await params).obligationId);
    const body = await request.json() as {
      action?: "generate" | "payg" | "lodge";
      paygInstalmentCents?: number | null;
      receiptNumber?: string;
      lodgedAmountCents?: number;
    };
    if (body.action === "generate") {
      const result = generateBasWorksheet(obligationId);
      return Response.json({ obligation: getObligationById(obligationId), ...result }, { status: 201 });
    }
    if (body.action === "payg") {
      if (body.paygInstalmentCents !== null && !Number.isSafeInteger(body.paygInstalmentCents)) {
        throw new Error("PAYG instalment must be integer cents");
      }
      const worksheet = updateBasPaygInstalment(obligationId, body.paygInstalmentCents ?? null);
      return Response.json({ obligation: getObligationById(obligationId), worksheet });
    }
    if (body.action === "lodge") {
      if (typeof body.receiptNumber !== "string" || !Number.isSafeInteger(body.lodgedAmountCents)) {
        throw new Error("ATO 回执号和已递交整数分金额均为必填");
      }
      const receiptNumber = body.receiptNumber;
      const lodgedAmountCents = body.lodgedAmountCents as number;
      const obligation = markBasLodged(obligationId, receiptNumber, lodgedAmountCents);
      return Response.json({ obligation, worksheet: getBasWorksheetByObligation(obligationId) });
    }
    throw new Error("无效的 BAS 操作");
  } catch (error) {
    return errorResponse(error);
  }
}
