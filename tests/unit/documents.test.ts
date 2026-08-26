import { beforeEach, expect, test } from "vitest";
import sharp from "sharp";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { createDocument } from "@/lib/ingest/documents";
import { prepareUpload } from "@/lib/ingest/upload";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM transactions; DELETE FROM documents;");
});

test("stores a document below data/files using a SHA-256 generated filename", async () => {
  const document = await createDocument({
    bytes: Buffer.from("%PDF-gate2"),
    filename: "../../outside.pdf",
    mime: "application/pdf",
    source: "upload",
  });

  expect(document.filePath).toMatch(/^data\/files\/[a-f0-9]{64}\.pdf$/);
  expect(document.filePath).not.toContain("outside");
  expect(document.status).toBe("pending");
});

test("returns a duplicate result without writing a second document", async () => {
  const input = {
    bytes: Buffer.from("same-file"),
    filename: "receipt.pdf",
    mime: "application/pdf",
    source: "upload" as const,
  };
  await createDocument(input);
  const duplicate = await createDocument(input);

  expect(duplicate.duplicate).toBe(true);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM documents").get()).toEqual({ count: 1 });
});

test("compresses an uploaded image before it reaches the document store", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 20, g: 30, b: 40 } } }).png().toBuffer();
  const prepared = await prepareUpload({
    name: "receipt.png",
    type: "image/png",
    arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
  });

  expect(prepared.mime).toBe("image/jpeg");
  expect(prepared.filename).toBe("receipt.jpg");
  expect(prepared.bytes.byteLength).toBeGreaterThan(0);
});
