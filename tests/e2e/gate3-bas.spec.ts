import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("generates three Q1 BAS worksheets with traceable lines, Simpler BAS instructions and PAYG lodgement validation", async ({ page }) => {
  const config = await page.request.get("/api/import/csv");
  const accounts = (await config.json() as { accounts: Array<{ id: number; entityId: string }> }).accounts;
  const values = [
    { entityId: "boyun_co", amountCents: 110000, gstCents: 10000, description: `Gate3 Boyun ${Date.now()}` },
    { entityId: "yeeliving_co", amountCents: 220000, gstCents: 20000, description: `Gate3 Yeeliving ${Date.now()}` },
  ];
  for (const value of values) {
    const account = accounts.find((item) => item.entityId === value.entityId);
    expect(account).toBeDefined();
    const response = await page.request.post("/api/transactions", {
      data: { ...value, date: "2026-07-04", accountId: account?.id, gstCode: "GST_INCOME", reviewFlag: false, source: "gate3-test" },
    });
    expect(response.status()).toBe(201);
  }

  const obligationsResponse = await page.request.get("/api/obligations?fy=2026-27");
  const obligations = (await obligationsResponse.json() as { obligations: Array<{ id: number; entityId: string; ruleId: string; periodLabel: string }> }).obligations;
  const q1 = new Map(obligations.filter((item) => item.ruleId === "bas_quarterly" && item.periodLabel.endsWith(" Q1")).map((item) => [item.entityId, item]));

  await page.goto(`/bas/${q1.get("boyun_co")?.id}`);
  await page.getByRole("button", { name: "生成 BAS 底稿" }).click();
  await expect(page.getByTestId("bas-internal-summary")).toBeVisible();
  await expect(page.getByTestId("bas-line-item")).toHaveCount(1);
  await expect(page.getByTestId("bas-line-item")).toContainText("交易 #");
  const instructionText = await page.getByTestId("bas-instructions").innerText();
  expect(instructionText).toContain("G1");
  expect(instructionText).toContain("1A");
  expect(instructionText).toContain("1B");
  expect(instructionText).not.toContain("G10");
  expect(instructionText).not.toContain("G11");
  await expect(page.getByTestId("bas-internal-summary")).toContainText("G10（内部核算用，不填入 ATO 表单）");
  await expect(page.getByTestId("bas-internal-summary")).toContainText("G11（内部核算用，不填入 ATO 表单）");
  await page.getByLabel("payg5aCents").fill("2500");
  await page.getByLabel("payg5bCents").fill("0");
  await page.getByRole("button", { name: "保存 PAYG" }).click();
  await expect(page.getByText("已重新计算 statementTotalCents", { exact: false })).toBeVisible();
  await page.getByLabel("ATO 回执号").fill("ATO-GATE3-1");
  await expect(page.getByLabel("已递交金额（整数分）")).toHaveValue("12500");
  await page.getByLabel("实际递交日期").fill("15/01/2027");
  await page.getByRole("button", { name: "标记已递交" }).click();
  await expect(page.getByText("已记录 ATO 回执，金额已按 statementTotalCents 校验", { exact: true })).toBeVisible();
  await expect(page.getByText("lodged", { exact: true })).toBeVisible();
  await page.screenshot({ path: "docs/evidence/gate9/e2e/gate3-bas-summary.png", fullPage: true });

  await page.goto(`/bas/${q1.get("yeeliving_co")?.id}`);
  await page.getByRole("button", { name: "生成 BAS 底稿" }).click();
  await expect(page.getByTestId("bas-line-item")).toHaveCount(1);

  await page.goto(`/bas/${q1.get("neighbourhood_co")?.id}`);
  await page.getByRole("button", { name: "生成 BAS 底稿" }).click();
  await expect(page.getByText("nil BAS", { exact: false })).toBeVisible();
  await expect(page.getByText("nil activity statement", { exact: false })).toBeVisible();
  await page.getByLabel("本期无 PAYG 分期").check();
  await page.getByRole("button", { name: "保存 PAYG" }).click();
  await expect(page.getByText("应缴", { exact: false })).toBeVisible();
  await page.getByLabel("ATO 回执号").fill("ATO-NIL-GATE3-1");
  await expect(page.getByLabel("已递交金额（整数分）")).toHaveValue("0");
  await page.getByLabel("实际递交日期").fill("16/01/2027");
  await page.getByRole("button", { name: "标记已递交" }).click();
  await expect(page.getByText("已记录 ATO 回执，金额已按 statementTotalCents 校验", { exact: true })).toBeVisible();

  const boyunWorksheet = await page.request.get(`/api/bas/${q1.get("boyun_co")?.id}`);
  const worksheetPayload = await boyunWorksheet.json() as { worksheet: { id: number; statementTotalCents: number | null } };
  expect(worksheetPayload.worksheet.statementTotalCents).toBe(12500);
  const csv = await page.request.get(`/api/bas/${q1.get("boyun_co")?.id}?format=csv`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const csvText = await csv.text();
  expect(csvText).toContain("transaction_id");
  expect(csvText).toContain("04 Jul 2026");
  expect(csvText).not.toContain("2026-07-04");
  const pdf = await page.request.get(`/api/bas/${q1.get("boyun_co")?.id}?format=pdf`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const pdfBody = await pdf.body();
  expect(pdfBody.subarray(0, 8).toString()).toBe("%PDF-1.4");
  fs.mkdirSync("docs/evidence/gate9/e2e/pdf", { recursive: true });
  fs.writeFileSync("docs/evidence/gate9/e2e/pdf/bas-worksheet-gate3.pdf", pdfBody);
});
