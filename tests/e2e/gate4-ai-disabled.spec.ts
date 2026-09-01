import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("AI disabled keeps the full desktop site flow available and does not block the dashboard", async ({ page }) => {
  const api = await page.request.get("/api/news");
  expect(api.ok()).toBeTruthy();
  expect(await api.json()).toMatchObject({ aiEnabled: false });

  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (/ato\.gov\.au|asic\.gov\.au|consumer\.vic\.gov\.au|treasury\.gov\.au/.test(request.url())) externalRequests.push(request.url());
  });
  const obligationsResponse = await page.request.get("/api/obligations?fy=2026-27");
  expect(obligationsResponse.ok()).toBeTruthy();
  const obligations = (await obligationsResponse.json() as { obligations: Array<{ id: number; ruleId: string }> }).obligations;
  const firstObligation = obligations[0];
  const firstBas = obligations.find((obligation) => obligation.ruleId === "bas_quarterly");
  expect(firstObligation).toBeDefined();
  expect(firstBas).toBeDefined();
  const paths = [
    "/",
    "/inbox",
    "/import",
    "/upload",
    "/settings",
    "/news",
    `/obligations/${firstObligation?.id}`,
    `/bas/${firstBas?.id}`,
  ];
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should load`).toBe(200);
  }
  expect(externalRequests).toEqual([]);
  const newsResponse = await page.goto("/news");
  expect(newsResponse?.status(), "/news should load for the AI status assertion").toBe(200);
  await expect(page.getByTestId("ai-status")).toContainText("AI 已关闭");
  fs.mkdirSync("docs/evidence/gate9/e2e", { recursive: true });
  await page.screenshot({ path: "docs/evidence/gate9/e2e/gate4-ai-disabled-news.png", fullPage: true });
});
