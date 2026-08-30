import { confirmDocument, confirmInboxItem, copyPreviousTransaction, listInboxItems } from "@/lib/ingest/inbox";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ items: await listInboxItems() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Inbox 暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action: "confirm_transaction" | "confirm_document" | "copy_transaction";
      transactionId?: number;
      documentId?: number;
      entityId?: string;
      accountId?: number;
      gstCode?: "GST_INCOME" | "GST_FREE_INCOME" | "INPUT_TAXED" | "NOT_A_SUPPLY" | "GST_EXPENSE" | "GST_CAPITAL" | "NO_GST" | "PRIVATE";
    };
    if (body.action === "confirm_transaction") {
      if (body.transactionId === undefined || !body.entityId || body.accountId === undefined || !body.gstCode) {
        return Response.json({ error: "主体、科目和 GST 代码均为必填" }, { status: 400 });
      }
      return Response.json({ transaction: confirmInboxItem({
        transactionId: body.transactionId,
        entityId: body.entityId,
        accountId: body.accountId,
        gstCode: body.gstCode,
      }) });
    }
    if (body.action === "confirm_document" && body.documentId !== undefined) {
      return Response.json({ document: confirmDocument(body.documentId) });
    }
    if (body.action === "copy_transaction" && body.transactionId !== undefined) {
      return Response.json({ draft: copyPreviousTransaction(body.transactionId) });
    }
    return Response.json({ error: "无效的 Inbox 操作" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Inbox 操作失败" }, { status: 400 });
  }
}
