import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

export const SUPPORTED_DOCUMENT_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedDocumentMime = (typeof SUPPORTED_DOCUMENT_MIMES)[number];

export type CreateDocumentInput = {
  bytes: Uint8Array;
  filename: string;
  mime: string;
  source: string;
  entityId?: string | null;
};

export type DocumentRecord = {
  id: number;
  entityId: string | null;
  filePath: string;
  mime: string;
  sha256: string;
  source: string;
  status: string;
  uploadedAt: string;
  filename: string | null;
  duplicate: boolean;
};

type DocumentRow = {
  id: number;
  entity_id: string | null;
  file_path: string;
  mime: string;
  sha256: string;
  source: string;
  status: string;
  uploaded_at: string;
};

function extensionForMime(mime: SupportedDocumentMime) {
  switch (mime) {
    case "application/pdf": return "pdf";
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
  }
}

function assertSupportedMime(mime: string): asserts mime is SupportedDocumentMime {
  if (!SUPPORTED_DOCUMENT_MIMES.includes(mime as SupportedDocumentMime)) {
    throw new Error(`Unsupported document type: ${mime}`);
  }
}

function mapDocument(row: DocumentRow, filename: string | null, duplicate = false): DocumentRecord {
  return {
    id: row.id,
    entityId: row.entity_id,
    filePath: row.file_path,
    mime: row.mime,
    sha256: row.sha256,
    source: row.source,
    status: row.status,
    uploadedAt: row.uploaded_at,
    filename,
    duplicate,
  };
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
  runMigrations();
  assertSupportedMime(input.mime);
  if (!input.filename?.trim()) throw new Error("Filename is required");
  if (!input.bytes || input.bytes.byteLength === 0) throw new Error("Document is empty");

  const bytes = Buffer.from(input.bytes);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const db = getRawDb();
  const existing = db.prepare("SELECT * FROM documents WHERE sha256 = ?").get(sha256) as DocumentRow | undefined;
  if (existing) {
    return mapDocument(existing, input.filename, true);
  }

  const relativePath = path.join("data", "files", `${sha256}.${extensionForMime(input.mime)}`);
  const absoluteDirectory = path.resolve(process.cwd(), "data", "files");
  const absolutePath = path.resolve(process.cwd(), relativePath);
  if (!absolutePath.startsWith(`${absoluteDirectory}${path.sep}`)) {
    throw new Error("Unsafe document path");
  }
  await fs.mkdir(absoluteDirectory, { recursive: true });
  await fs.writeFile(absolutePath, bytes, { flag: "wx" }).catch(async (error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  });

  try {
    const result = db.prepare(`
      INSERT INTO documents (entity_id, file_path, mime, sha256, source, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(input.entityId ?? null, relativePath.split(path.sep).join("/"), input.mime, sha256, input.source.trim() || "upload");
    const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(Number(result.lastInsertRowid)) as DocumentRow;
    return mapDocument(row, input.filename, false);
  } catch (error) {
    const duplicate = db.prepare("SELECT * FROM documents WHERE sha256 = ?").get(sha256) as DocumentRow | undefined;
    if (duplicate) return mapDocument(duplicate, input.filename, true);
    await fs.rm(absolutePath, { force: true });
    throw error;
  }
}

export function listDocuments() {
  runMigrations();
  const rows = getRawDb().prepare("SELECT * FROM documents ORDER BY uploaded_at DESC, id DESC").all() as DocumentRow[];
  return rows.map((row) => mapDocument(row, null, false));
}
