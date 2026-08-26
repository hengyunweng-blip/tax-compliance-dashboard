import sharp from "sharp";
import { SUPPORTED_DOCUMENT_MIMES, type SupportedDocumentMime } from "@/lib/ingest/documents";

export type UploadFileLike = {
  name: string;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export async function prepareUpload(file: UploadFileLike) {
  if (!file.name?.trim()) throw new Error("Filename is required");
  if (!SUPPORTED_DOCUMENT_MIMES.includes(file.type as SupportedDocumentMime)) {
    throw new Error(`Unsupported document type: ${file.type}`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length) throw new Error("Document is empty");
  if (file.type.startsWith("image/")) {
    return {
      bytes: await sharp(bytes).rotate().jpeg({ quality: 85 }).toBuffer(),
      filename: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      mime: "image/jpeg",
    } as const;
  }
  return { bytes, filename: file.name, mime: file.type } as const;
}
