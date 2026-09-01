import { expect, test } from "@playwright/test";

test("previews, maps and persists a CSV row as an Inbox transaction", async ({ page }) => {
  const suffix = Date.now() % 100;
  const description = `Gate2 CSV ${Date.now()}`;
  await page.goto("/import");
  await page.getByLabel("CSV 文件").setInputFiles({
    name: "gate2-bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Date,Narration,Amount\n02/07/2026,${description},1200.${String(suffix).padStart(2, "0")}\n`),
  });
  await page.getByRole("button", { name: "1. 生成预览" }).click();
  await expect(page.getByText(/1 行/)).toBeVisible();
  await expect(page.getByLabel("日期格式")).toHaveValue("DD/MM/YYYY");
  await expect(page.getByText("02 Jul 2026", { exact: true })).toBeVisible();
  await page.getByLabel("科目").selectOption({ index: 1 });
  await page.getByRole("button", { name: "2. 导入并进入 Inbox" }).click();
  await expect(page.getByText("导入完成，待确认记录已进入 Inbox")).toBeVisible();
  await page.goto("/inbox");
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await page.screenshot({ path: "docs/evidence/gate9/e2e/gate2-inbox-after-csv.png", fullPage: true });
  await page.goto("/");
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await page.screenshot({ path: "docs/evidence/gate9/e2e/gate2-dashboard-blocked-fix.png", fullPage: true });
});
