import crypto from "node:crypto";
import { createDocument, SUPPORTED_DOCUMENT_MIMES, type DocumentRecord, type SupportedDocumentMime } from "@/lib/ingest/documents";

export type EmailAttachment = {
  filename: string;
  mime: string;
  bytes: Uint8Array;
};

export type Base64EmailAttachment = {
  filename: string;
  mime: string;
  base64: string;
};

export class EmailIngestError extends Error {
  constructor(message: string, public readonly status: 400 | 401) {
    super(message);
    this.name = "EmailIngestError";
  }
}

function validToken(provided: string | undefined) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected || !provided) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  const length = Math.max(providedBytes.length, expectedBytes.length);
  const paddedProvided = Buffer.alloc(length);
  const paddedExpected = Buffer.alloc(length);
  providedBytes.copy(paddedProvided);
  expectedBytes.copy(paddedExpected);
  return crypto.timingSafeEqual(paddedProvided, paddedExpected)
    && providedBytes.length === expectedBytes.length;
}

function assertToken(token: string | undefined) {
  if (!validToken(token)) throw new EmailIngestError("Invalid ingest token", 401);
}

function assertMime(mime: string): asserts mime is SupportedDocumentMime {
  if (!SUPPORTED_DOCUMENT_MIMES.includes(mime as SupportedDocumentMime)) {
    throw new EmailIngestError(`Unsupported document type: ${mime}`, 400);
  }
}

function decodeBase64(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new EmailIngestError("Malformed base64 attachment", 400);
  }
  const bytes = Buffer.from(normalized, "base64");
  if (!bytes.length) throw new EmailIngestError("Malformed base64 attachment", 400);
  return bytes;
}

function validateAttachments(attachments: EmailAttachment[]) {
  if (!attachments.length) throw new EmailIngestError("At least one attachment is required", 400);
  for (const attachment of attachments) {
    if (!attachment.filename?.trim()) throw new EmailIngestError("Attachment filename is required", 400);
    assertMime(attachment.mime);
    if (!attachment.bytes?.byteLength) throw new EmailIngestError("Attachment is empty", 400);
  }
}

export async function ingestEmailAttachments({ token, attachments }: { token?: string; attachments: EmailAttachment[] }): Promise<DocumentRecord[]> {
  assertToken(token);
  validateAttachments(attachments);
  const documents: DocumentRecord[] = [];
  for (const attachment of attachments) {
    documents.push(await createDocument({
      bytes: attachment.bytes,
      filename: attachment.filename,
      mime: attachment.mime,
      source: "email",
    }));
  }
  return documents;
}

export async function ingestEmail({
  contentType,
  body,
  token,
}: {
  contentType: string;
  body: string | Uint8Array | { attachments: Base64EmailAttachment[] };
  token?: string;
}): Promise<DocumentRecord[]> {
  assertToken(token);
  if (!contentType.toLowerCase().includes("json")) {
    throw new EmailIngestError("Multipart requests must be parsed by the route handler", 400);
  }

  let parsed: unknown;
  try {
    parsed = typeof body === "string"
      ? JSON.parse(body)
      : body instanceof Uint8Array
        ? JSON.parse(Buffer.from(body).toString("utf8"))
        : body;
  } catch {
    throw new EmailIngestError("Malformed email payload", 400);
  }
  if (!parsed || typeof parsed !== "object" || !("attachments" in parsed) || !Array.isArray(parsed.attachments)) {
    throw new EmailIngestError("Attachments are required", 400);
  }
  const attachments: EmailAttachment[] = parsed.attachments.map((attachment: unknown) => {
    if (!attachment || typeof attachment !== "object") throw new EmailIngestError("Malformed attachment", 400);
    const value = attachment as Partial<Base64EmailAttachment>;
    if (typeof value.filename !== "string" || typeof value.mime !== "string" || typeof value.base64 !== "string") {
      throw new EmailIngestError("Malformed attachment", 400);
    }
    return { filename: value.filename, mime: value.mime, bytes: decodeBase64(value.base64) };
  });
  return ingestEmailAttachments({ token, attachments });
}
