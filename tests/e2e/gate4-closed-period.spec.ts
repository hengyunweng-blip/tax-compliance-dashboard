import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("keeps a late Q1 transaction in the closed-period Inbox and requires a Q2 decision", async ({ page }) => {
  const config = await page.request.get("/api/import/csv");
  expect(config.ok()).toBeTruthy();
  const accounts = (await config.json() as { accounts: Array<{ id: number; entityId: string }> }).accounts;
  const account = accounts.find((item) => item.entityId === "boyun_co");
  expect(account).toBeDefined();

  const obligationsResponse = await page.request.get("/api/obligations?fy=2026-27");
  const obligations = (await obligationsResponse.json() as { obligations: Array<{ id: number; entityId: string; ruleId: string; periodLabel: string; status: string }> }).obligations;
  const q1 = obligations.find((item) => item.entityId === "boyun_co" && item.ruleId === "bas_quarterly" && item.periodLabel.endsWith(" Q1"));
  const q2 = obligations.find((item) => item.entityId === "boyun_co" && item.ruleId === "bas_quarterly" && item.periodLabel.endsWith(" Q2"));
  expect(q1).toBeDefined();
  expect(q2).toBeDefined();

  const q1Before = await page.request.get(`/api/bas/${q1?.id}`);
  const q1BeforePayload = await q1Before.json() as { worksheet: { id: number; statementTotalCents: number | null; g1Cents: number; a1Cents: number; b1Cents: number } | null };
  if (!q1BeforePayload.worksheet) {
    const generated = await page.request.post(`/api/bas/${q1?.id}`, { data: { action: "generate" } });
    expect(generated.status()).toBe(201);
    await page.request.post(`/api/bas/${q1?.id}`, { data: { action: "payg", payg5aCents: 0, payg5bCents: 0 } });
  }
  const q1AfterGenerate = await page.request.get(`/api/bas/${q1?.id}`);
  const q1Payload = await q1AfterGenerate.json() as { obligation: { status: string }; worksheet: { id: number; statementTotalCents: number | null; g1Cents: number; a1Cents: number; b1Cents: number } };
  if (q1Payload.obligation.status === "draft_ready") {
    expect(q1Payload.worksheet.statementTotalCents).not.toBeNull();
    const lodged = await page.request.post(`/api/bas/${q1?.id}`, { data: { action: "lodge", receiptNumber: `ATO-GATE4-${Date.now()}`, lodgedAmountCents: q1Payload.worksheet.statementTotalCents } });
    expect(lodged.ok()).toBeTruthy();
  }
  const originalAmounts = { g1Cents: q1Payload.worksheet.g1Cents, a1Cents: q1Payload.worksheet.a1Cents, b1Cents: q1Payload.worksheet.b1Cents, statementTotalCents: q1Payload.worksheet.statementTotalCents };

  const lateDescription = `Gate4 late Q1 ${Date.now()}`;
  const created = await page.request.post("/api/transactions", {
    data: { entityId: "boyun_co", date: "2026-07-05", description: lateDescription, accountId: account?.id, gstCode: "GST_INCOME", amountCents: 110000, gstCents: 10000, reviewFlag: false, source: "gate4-e2e" },
  });
  expect(created.status()).toBe(201);
  const createdPayload = await created.json() as { transaction: { id: number; belongsToClosedPeriod: boolean; closedPeriodWorksheetId: number | null } };
  expect(createdPayload.transaction).toMatchObject({ belongsToClosedPeriod: true, closedPeriodWorksheetId: q1Payload.worksheet.id });

  const inbox = await page.request.get("/api/inbox");
  const inboxPayload = await inbox.json() as { items: Array<{ kind: string; id: number }> };
  expect(inboxPayload.items).toContainEqual(expect.objectContaining({ kind: "closed_period_transaction", id: createdPayload.transaction.id }));
  expect(inboxPayload.items).not.toContainEqual(expect.objectContaining({ kind: "transaction", id: createdPayload.transaction.id }));

  await page.goto("/inbox");
  await expect(page.getByTestId("closed-period-inbox")).toContainText("已关账期间补录");
  await expect(page.getByTestId(`closed-period-transaction-${createdPayload.transaction.id}`)).toContainText(lateDescription);
  fs.mkdirSync("docs/evidence/gate4", { recursive: true });
  await page.screenshot({ path: "docs/evidence/gate4/closed-period-inbox.png", fullPage: true });

  await page.goto(`/bas/${q2?.id}`);
  await page.getByRole("button", { name: "生成 BAS 底稿" }).click();
  await expect(page.getByTestId("closed-period-choice")).toContainText("有 1 笔属于已关账期间");
  await page.getByRole("button", { name: "并入本期作为更正" }).click();
  await expect(page.getByText("BAS 底稿已生成，纳入交易已锁定", { exact: true })).toBeVisible();

  const q1Final = await page.request.get(`/api/bas/${q1?.id}`);
  const q1FinalPayload = await q1Final.json() as { worksheet: { g1Cents: number; a1Cents: number; b1Cents: number; statementTotalCents: number | null } };
  expect(q1FinalPayload.worksheet).toEqual(expect.objectContaining(originalAmounts));
  await page.screenshot({ path: "docs/evidence/gate4/closed-period-q2-resolution.png", fullPage: true });
});
