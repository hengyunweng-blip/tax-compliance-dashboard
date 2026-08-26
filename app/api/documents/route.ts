import { createDocument, listDocuments } from "@/lib/ingest/documents";
import { prepareUpload } from "@/lib/ingest/upload";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return Response.json({ documents: listDocuments() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "文档暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = [...formData.getAll("files"), ...formData.getAll("file")].filter((value): value is File => value instanceof File);
    if (!files.length) {
      return Response.json({ error: "至少选择一个文件" }, { status: 400 });
    }
    const entityId = formData.get("entityId");
    const entity = typeof entityId === "string" && entityId.trim() ? entityId.trim() : null;
    const documents = [];
    for (const file of files) {
      const prepared = await prepareUpload(file);
      documents.push(await createDocument({ ...prepared, source: "upload", entityId: entity }));
    }
    return Response.json({ documents }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "文档上传失败" }, { status: 400 });
  }
}
