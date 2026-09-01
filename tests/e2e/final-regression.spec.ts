import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("Gate 5 annual, Div 7A, super and backup flows render with fixed dates", async ({ page }) => {
  fs.mkdirSync("docs/evidence/gate9/e2e", { recursive: true });

  await page.goto("/annual");
  await expect(page.getByTestId("annual-page")).toBeVisible();
  await expect(page.getByTestId("company-worksheet").first()).toContainText("待人工补充");
  await expect(page.getByText("折旧", { exact: true }).first()).toBeVisible();
  const priorYearResponse = page.waitForResponse((response) => response.url().includes("/api/annual?fy=FY2025-26") && response.request().method() === "GET");
  await page.getByLabel("所属年度").selectOption("FY2025-26");
  expect((await priorYearResponse).ok()).toBe(true);
  await expect(page.getByTestId("trust-worksheet")).toContainText("FY2025–26");
  const currentYearResponse = page.waitForResponse((response) => response.url().includes("/api/annual?fy=FY2026-27") && response.request().method() === "GET");
  await page.getByLabel("所属年度").selectOption("FY2026-27");
  expect((await currentYearResponse).ok()).toBe(true);
  await page.screenshot({ path: "docs/evidence/gate9/e2e/annual-worksheets.png", fullPage: true });

  await page.goto("/div7a");
  await expect(page.getByTestId("div7a-page")).toBeVisible();
  const rateResponse = await page.request.post("/api/div7a/rates", {
    data: {
      incomeYear: "FY2017-18",
      rateText: "5.30%",
      sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
      retrievedAt: "2026-08-29",
      notes: "Gate 5 regression fixture; the official baseline remains in tests/fixtures/div7a/ato-baseline.json.",
    },
  });
  expect(rateResponse.ok()).toBe(true);
  const suffix = Date.now();
  await page.getByLabel("借款人").fill(`Gate5 borrower ${suffix}`);
  await page.getByLabel("贷款日").fill("15/05/2017");
  await page.getByLabel("本金（AUD）").fill("100000.00");
  await page.getByRole("button", { name: "保存贷款" }).click();
  await expect(page.getByText("Div 7A 贷款已保存", { exact: false })).toBeVisible();
  await page.getByLabel("评估所得年度").selectOption("FY2017-18");
  await expect(page.getByText("$17,470.34", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/15 May 2017/).first()).toBeVisible();
  await page.getByLabel("评估所得年度").selectOption("FY2026-27");
  await expect(page.getByText("已到期").first()).toBeVisible();
  await page.screenshot({ path: "docs/evidence/gate9/e2e/div7a-official-baseline.png", fullPage: true });

  await page.goto("/super");
  await expect(page.getByTestId("super-progress")).toBeVisible();
  await expect(page.getByText("$32,500.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$130,000.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 · 供款到账" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 · 抵扣意向通知" })).toBeVisible();
  await expect(page.getByTestId("backup-controls")).toBeVisible();
  const backup = await page.request.get("/api/backup");
  expect(backup.status()).toBe(200);
  expect(backup.headers()["content-type"]).toContain("application/zip");
  expect((await backup.body()).subarray(0, 2).toString()).toBe("PK");
  await page.screenshot({ path: "docs/evidence/gate9/e2e/super-backup.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/annual", "/div7a", "/super"]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `${route} overflows narrow viewport`).toBe(false);
  }
});
