import { restoreBackupArchive } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择备份 zip 文件" }, { status: 400 });
    await restoreBackupArchive(Buffer.from(await file.arrayBuffer()));
    return Response.json({ restored: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "备份还原失败" }, { status: 400 });
  }
}
