import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { POST } from "@/app/api/ingest/email/route";

beforeEach(() => {
  process.env.INGEST_TOKEN = "test-ingest-token";
  seedDatabase();
  getRawDb().exec("DELETE FROM transactions; DELETE FROM documents;");
});

function pdfAttachment() {
  return {
    filename: "receipt.pdf",
    mime: "application/pdf",
    base64: Buffer.from("%PDF-test").toString("base64"),
  };
}

async function requestEmail(token: string | undefined, attachments: unknown[]) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== undefined) headers.set("x-ingest-token", token);
  return POST(new Request("http://localhost/api/ingest/email", {
    method: "POST",
    headers,
    body: JSON.stringify({ attachments }),
  }));
}

test("rejects email ingestion without the shared token before writing", async () => {
  const response = await requestEmail("wrong", [pdfAttachment()]);

  expect(response.status).toBe(401);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM documents").get()).toEqual({ count: 0 });
});

test("accepts a base64 PDF with the configured shared token", async () => {
  const response = await requestEmail("test-ingest-token", [pdfAttachment()]);

  expect(response.status).toBe(201);
  expect((await response.json()).documents).toHaveLength(1);
});

test("rejects malformed base64 and unsupported files without writing", async () => {
  const response = await requestEmail("test-ingest-token", [{
    filename: "receipt.pdf",
    mime: "application/pdf",
    base64: "not base64!",
  }]);

  expect(response.status).toBe(400);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM documents").get()).toEqual({ count: 0 });
});

test("accepts multipart email attachments through the same shared-token route", async () => {
  const formData = new FormData();
  formData.append("attachments", new File([Buffer.from("multipart-pdf")], "multipart.pdf", { type: "application/pdf" }));
  const response = await POST(new Request("http://localhost/api/ingest/email", {
    method: "POST",
    headers: { "x-ingest-token": "test-ingest-token" },
    body: formData,
  }));

  expect(response.status).toBe(201);
  expect((await response.json()).documents).toHaveLength(1);
});
