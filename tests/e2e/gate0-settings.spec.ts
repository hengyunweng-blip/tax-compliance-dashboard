import { expect, test } from "@playwright/test";

test("renders six entities and persists Boyun ACN and ASIC date", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.locator("[data-testid^=entity-row-]")).toHaveCount(6);

  const row = page.getByTestId("entity-row-boyun_co");
  await row.getByLabel("ACN").fill("123456789");
  await row.getByLabel("ASIC 周年日").fill("2026-07-15");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("设置已保存")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("entity-row-boyun_co").getByLabel("ACN")).toHaveValue("123456789");
  await expect(page.getByTestId("entity-row-boyun_co").getByLabel("ASIC 周年日")).toHaveValue("2026-07-15");
});

test("settings layout has no viewport overflow at a narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  const acnBox = await page.getByTestId("entity-row-boyun_co").getByLabel("ACN").boundingBox();
  expect(acnBox?.width ?? 0).toBeGreaterThan(120);
  await expect(page.getByRole("button", { name: "保存设置" })).toBeVisible();
});
