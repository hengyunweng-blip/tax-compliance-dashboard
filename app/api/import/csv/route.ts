import { GST_CODES, type GstCode } from "@/lib/constants/gst";
import { getRawDb } from "@/lib/db/client";
import { importCsv, normalizeCsvMapping, parseCsvPreview, saveCsvMappingTemplate, type CsvMapping, type CsvRow } from "@/lib/ingest/csv";
import { listTransactions } from "@/lib/ingest/transactions";
import { runMigrations } from "@/lib/db/migrate";

export const dynamic = "force-dynamic";

function parseMapping(value: FormDataEntryValue | undefined): CsvMapping | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = JSON.parse(value) as CsvMapping;
  if (!parsed.date || !parsed.description || !parsed.amount) throw new Error("Date, description and amount mappings are required");
  return normalizeCsvMapping(parsed);
}

function parseOptionalPositiveInt(value: FormDataEntryValue | undefined) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Invalid account");
  return parsed;
}

function importRows({
  rows,
  mapping,
  bankId,
  entityId,
  accountId,
  accountCode,
  gstCode,
}: {
  rows: CsvRow[];
  mapping: CsvMapping;
  bankId?: string;
  entityId?: string;
  accountId?: number;
  accountCode?: string;
  gstCode?: GstCode;
}) {
  if (bankId) saveCsvMappingTemplate({ bankId, mapping });
  const existing = entityId
    ? listTransactions({ entityId }).map((transaction) => {
      let rowHash: string | undefined;
      try {
        const notes = transaction.notes ? JSON.parse(transaction.notes) as { rowHash?: unknown } : null;
        rowHash = typeof notes?.rowHash === "string" ? notes.rowHash : undefined;
      } catch {
        rowHash = undefined;
      }
      return { date: transaction.date, amountCents: transaction.amountCents, rowHash };
    })
    : [];
  return importCsv({ rows, mapping, bankId, entityId, accountId, accountCode, gstCode, existing });
}

export function GET() {
  runMigrations();
  const db = getRawDb();
  const entities = db.prepare("SELECT id, name FROM entities WHERE active = 1 ORDER BY sort_order").all();
  const accounts = db.prepare("SELECT id, entity_id AS entityId, code, name, default_gst_code AS defaultGstCode FROM accounts WHERE archived = 0 ORDER BY entity_id, code").all();
  const templates = db.prepare("SELECT bank_id AS bankId, mapping_json AS mappingJson FROM csv_mapping_templates ORDER BY bank_id").all();
  return Response.json({ entities, accounts, templates });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) return Response.json({ error: "CSV 文件是必需的" }, { status: 400 });
      const preview = parseCsvPreview(new Uint8Array(await file.arrayBuffer()));
      const mapping = parseMapping(formData.get("mapping") ?? undefined);
      if (!mapping) return Response.json({ preview }, { status: 200 });
      const gstCodeValue = formData.get("gstCode");
      const gstCode = typeof gstCodeValue === "string" && GST_CODES.includes(gstCodeValue as GstCode) ? gstCodeValue as GstCode : undefined;
      const summary = importRows({
        rows: preview.rows,
        mapping,
        bankId: typeof formData.get("bankId") === "string" ? formData.get("bankId") as string : undefined,
        entityId: typeof formData.get("entityId") === "string" ? formData.get("entityId") as string : undefined,
        accountId: parseOptionalPositiveInt(formData.get("accountId") ?? undefined),
        accountCode: typeof formData.get("accountCode") === "string" ? formData.get("accountCode") as string : undefined,
        gstCode,
      });
      return Response.json({ preview, summary }, { status: 201 });
    }

    const body = await request.json() as {
      bankId?: string;
      mapping: CsvMapping;
      rows: CsvRow[];
      entityId?: string;
      accountId?: number;
      accountCode?: string;
      gstCode?: GstCode;
    };
    const summary = importRows(body);
    return Response.json({ summary }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "CSV 导入失败" }, { status: 400 });
  }
}
