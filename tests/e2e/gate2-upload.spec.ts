import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("uploads a file and accepts a base64 email attachment with the shared token", async ({ page }) => {
  await page.goto("/upload");
  await expect(page.getByTestId("upload-dropzone")).toBeVisible();
  await page.getByLabel("选择文件").setInputFiles({
    name: "gate2-receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-gate2-browser"),
  });
  await page.getByRole("button", { name: "上传并进入 Inbox" }).click();
  await expect(page.getByText(/已接收 1 个文件/)).toBeVisible();
  await page.screenshot({ path: "docs/evidence/gate9/e2e/gate2-upload-desktop.png", fullPage: true });

  const unauthorized = await page.request.post("/api/ingest/email", {
    data: { attachments: [{ filename: "email.pdf", mime: "application/pdf", base64: Buffer.from("email").toString("base64") }] },
  });
  expect(unauthorized.status()).toBe(401);

  const accepted = await page.request.post("/api/ingest/email", {
    headers: { "x-ingest-token": "test-ingest-token" },
    data: { attachments: [{ filename: "email.pdf", mime: "application/pdf", base64: Buffer.from("email").toString("base64") }] },
  });
  expect(accepted.status()).toBe(201);
  expect((await accepted.json()).documents).toHaveLength(1);
});

test("keeps the upload controls usable at a narrow responsive width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/upload");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await expect(page.getByTestId("upload-dropzone")).toBeVisible();
  await expect(page.getByLabel("选择文件")).toBeVisible();
  await page.screenshot({ path: "docs/evidence/gate9/e2e/gate2-upload-narrow.png", fullPage: true });
});
