import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("renders and verifies the twelve BAS effective dates and income years", async ({ page }) => {
  const settingsResponse = await page.request.patch("/api/settings", {
    data: {
      entities: [
        { entityId: "boyun_co", acn: "123456789", asicReviewDate: "2026-07-15", gstRegistered: true, active: true },
        { entityId: "yeeliving_co", acn: null, asicReviewDate: null, gstRegistered: true, active: true },
        { entityId: "neighbourhood_co", acn: null, asicReviewDate: null, gstRegistered: true, active: true },
      ],
      licence: { licenceId: 1, anniversaryDate: "2026-08-15" },
    },
  });
  expect(settingsResponse.ok()).toBeTruthy();

  const obligationsResponse = await page.request.get("/api/obligations?fy=2026-27");
  expect(obligationsResponse.ok()).toBeTruthy();
  const payload = await obligationsResponse.json() as {
    obligations: Array<{
      id: number;
      entityId: string;
      ruleId: string;
      periodLabel: string;
      incomeYear: string;
      deadlineFy: string;
      statutoryDue: string | null;
      effectiveDue: string | null;
      windowOpens: string | null;
      status: string;
    }>;
  };
  const bas = payload.obligations.filter((obligation) => obligation.ruleId === "bas_quarterly");
  expect(bas).toHaveLength(12);

  const expectedRows = [
    ["Q1", "2026-10-28", "2026-11-11"],
    ["Q2", "2027-02-28", "2027-03-01"],
    ["Q3", "2027-04-28", "2027-05-12"],
    ["Q4", "2027-07-28", "2027-08-11"],
  ];
  for (const entityId of ["boyun_co", "yeeliving_co", "neighbourhood_co"]) {
    expect(bas.filter((obligation) => obligation.entityId === entityId).map((obligation) => [
      obligation.periodLabel.split(" ").at(-1),
      obligation.statutoryDue,
      obligation.effectiveDue,
    ])).toEqual(expectedRows);
  }
  expect(bas.every((obligation) => obligation.incomeYear === "FY2026-27" && obligation.deadlineFy === "FY2026-27")).toBeTruthy();
  expect(bas.some((obligation) => obligation.effectiveDue === "2027-03-14")).toBeFalsy();

  const calendarResponse = await page.request.get("/api/calendar/export?fy=2026-27");
  expect(calendarResponse.ok()).toBeTruthy();
  const calendar = await calendarResponse.text();
  expect(calendar).toContain("DTSTART;VALUE=DATE:20270301");
  expect(calendar.match(/BEGIN:VEVENT/g)?.length).toBe(payload.obligations.filter((obligation) => obligation.statutoryDue && obligation.effectiveDue).length);

  const missingAsic = payload.obligations.filter((obligation) => obligation.ruleId === "asic_annual_review" && obligation.entityId !== "boyun_co");
  expect(missingAsic).toHaveLength(2);
  expect(missingAsic.every((obligation) => obligation.status === "blocked" && obligation.statutoryDue === null && obligation.effectiveDue === null)).toBeTruthy();
  for (const entityId of ["boyun_co", "yeeliving_co", "neighbourhood_co"]) {
    const companyBasAndTax = payload.obligations.filter((obligation) =>
      obligation.entityId === entityId && (obligation.ruleId === "bas_quarterly" || obligation.ruleId === "company_tax_return"));
    expect(companyBasAndTax).toHaveLength(5);
    expect(companyBasAndTax.every((obligation) => obligation.status === "todo")).toBeTruthy();
  }
  const licence = payload.obligations.find((obligation) => obligation.ruleId === "estate_agent_licence_annual_statement");
  expect(licence).toMatchObject({
    windowOpens: "2026-07-04",
    statutoryDue: "2026-08-15",
    effectiveDue: "2026-08-14",
  });

  await page.goto("/");
  await expect(page.getByTestId("dashboard")).toBeVisible();
  for (const entityId of ["self", "spouse", "boyun_trust", "boyun_co", "yeeliving_co", "neighbourhood_co"]) {
    await expect(page.getByTestId(`entity-column-${entityId}`)).toBeVisible();
  }
  await expect(page.locator('[data-rule-id="bas_quarterly"]')).toHaveCount(12);
  await expect(page.getByText("FY2025–26 信托税表 · 截止 31 Oct 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("FY2025–26 公司税表 · 截止 28 Feb 2027", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("实际工作日：02 Nov 2026", { exact: true })).toHaveCount(3);
  await expect(page.getByText("实际工作日：01 Mar 2027", { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-rule-id="asic_annual_review"]').filter({ hasText: "日期待配置" })).toHaveCount(2);
  for (const entityId of ["boyun_co", "yeeliving_co", "neighbourhood_co"]) {
    const column = page.getByTestId(`entity-column-${entityId}`);
    await expect(column.locator('[data-rule-id="bas_quarterly"] .obligation-status')).toHaveCount(4);
    await expect(column.locator('[data-rule-id="bas_quarterly"] .obligation-status').filter({ hasText: "待处理" })).toHaveCount(4);
    await expect(column.locator('[data-rule-id="company_tax_return"] .obligation-status').filter({ hasText: "待处理" })).toHaveCount(1);
  }
  const licenceCard = page.getByTestId(`obligation-card-${licence?.id}`);
  await expect(licenceCard).toContainText("截止 15 Aug 2026");
  await expect(licenceCard).toContainText("窗口开启日：04 Jul 2026");
  await expect(licenceCard).toContainText("最高危险");

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/);
  expect(bodyText).not.toContain("mm/dd/yyyy");

  const trustReturn = payload.obligations.find((obligation) => obligation.ruleId === "trust_tax_return");
  expect(trustReturn).toBeDefined();
  await page.goto(`/obligations/${trustReturn?.id}`);
  await expect(page.getByRole("heading", { name: "FY2025–26 信托税表" })).toBeVisible();
  await expect(page.getByText("02 Nov 2026", { exact: true })).toBeVisible();
  const detailText = await page.locator("body").innerText();
  expect(detailText).not.toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/);

  await page.goto(`/obligations/${licence?.id}`);
  await expect(page.getByText("牌照将自动注销", { exact: false })).toBeVisible();
  await expect(page.locator(".detail-licence-consequence")).toContainText("05 Sep 2026");
});

test("saves and reloads the licence anniversary in the licence tab", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: "牌照配置" }).click();
  const licenceRegion = page.getByRole("region", { name: "牌照配置" });
  await licenceRegion.getByLabel("牌照周年日").fill("15/08/2026");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("设置已保存")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "牌照配置" }).click();
  await expect(page.getByRole("region", { name: "牌照配置" }).getByLabel("牌照周年日")).toHaveValue("15/08/2026");
});

test("keeps the dashboard usable at a narrow responsive width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByRole("heading", { name: "税务合规看板" })).toBeVisible();
});
