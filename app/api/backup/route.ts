import { createBackupArchive } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const archive = await createBackupArchive();
    return new Response(new Uint8Array(archive.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="tax-compliance-backup-${archive.manifest.createdAt.slice(0, 10)}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "备份导出失败" }, { status: 500 });
  }
}
