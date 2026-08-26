import { expect, test } from "@playwright/test";

test("confirms a review transaction with required fields and keyboard shortcuts", async ({ page }) => {
  const config = await page.request.get("/api/import/csv");
  const payload = await config.json() as { accounts: Array<{ id: number; entityId: string }> };
  const account = payload.accounts.find((item) => item.entityId === "boyun_co");
  expect(account).toBeDefined();
  const description = `Gate2 Inbox ${Date.now()}`;
  const created = await page.request.post("/api/transactions", {
    data: {
      entityId: "boyun_co",
      date: "2026-07-04",
      description,
      accountId: account?.id,
      gstCode: "GST_EXPENSE",
      amountCents: 98765,
      gstCents: 0,
      reviewFlag: true,
      source: "gate2-test",
    },
  });
  expect(created.status()).toBe(201);
  const persisted = await page.request.get(`/api/transactions?entityId=boyun_co&fy=2026-27&quarter=Q1`);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).transactions).toEqual(expect.arrayContaining([
    expect.objectContaining({ description, amountCents: 98765 }),
  ]));

  await page.goto("/inbox");
  const row = page.getByTestId(/inbox-transaction-/).filter({ hasText: description });
  await expect(row).toBeVisible();
  await row.getByLabel("Inbox 科目").selectOption("");
  await row.getByRole("button", { name: "确认" }).click();
  await expect(row.getByText("主体、科目和 GST 代码均为必填")).toBeVisible();

  await row.focus();
  await row.press("1");
  await row.press("Enter");
  await expect(row).toBeHidden();
  await page.screenshot({ path: "docs/evidence/gate2/inbox-keyboard-confirmed.png", fullPage: true });
});
