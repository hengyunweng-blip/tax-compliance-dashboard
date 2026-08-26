import { EmailIngestError, ingestEmail, ingestEmailAttachments } from "@/lib/ingest/email";

export const dynamic = "force-dynamic";

function requestToken(request: Request) {
  const headerToken = request.headers.get("x-ingest-token");
  if (headerToken) return headerToken;
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
}

export async function POST(request: Request) {
  try {
    const token = requestToken(request);
    const contentType = request.headers.get("content-type") ?? "";
    let documents;
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = [...formData.getAll("attachments"), ...formData.getAll("files"), ...formData.getAll("file")]
        .filter((value): value is File => value instanceof File);
      documents = await ingestEmailAttachments({
        token,
        attachments: await Promise.all(files.map(async (file) => ({
          filename: file.name,
          mime: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }))),
      });
    } else {
      documents = await ingestEmail({ contentType, body: await request.text(), token });
    }
    return Response.json({ documents }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailIngestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: error instanceof Error ? error.message : "邮件附件接收失败" }, { status: 400 });
  }
}
