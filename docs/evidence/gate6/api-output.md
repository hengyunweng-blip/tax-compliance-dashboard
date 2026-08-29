# Gate 6 实际 API / ICS 输出摘录

取数日期：2026-08-29。API 来自运行在 `http://127.0.0.1:3016` 的临时 UI 数据库 `/tmp/tax-gate6-ui.FMK0tk/app.db`。

## 1. 带期初余额的贷款：`GET /api/div7a?fy=2026-27`

实际响应中贷款 `id = 1` 的关键字段：

```json
{
  "id": 1,
  "loanIncomeYear": "FY2019-20",
  "originalTermYears": 7,
  "assessmentIncomeYear": "FY2026-27",
  "benchmarkRateText": "8.77%",
  "benchmarkRateSourceUrl": "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
  "benchmarkRateRetrievedAt": "2026-08-29",
  "openingBalanceCents": 5000000,
  "interestCents": 438500,
  "minimumRepaymentCents": 5438500,
  "actualRepaymentCents": 0,
  "closingBalanceCents": 5438500,
  "remainingTermYears": 1,
  "repaymentStatus": "active",
  "repaymentDue": "2027-06-30",
  "shortfallCents": 5438500
}
```

同一响应的 `schedule` 包含连续的 `FY2026-27` active 行和 `FY2027-28` expired 行；后者的 `closingBalanceCents` 与 `unresolvedBalanceCents` 均为 `5438500`，并带有人工核对/不自动创建分红的警告。

## 2. 每笔协议义务：`GET /api/obligations?fy=2026-27`

实际响应中用于 UI 看板证据的贷款 `id = 3`：

```json
{
  "id": 86,
  "ruleId": "div7a_loan_agreement",
  "entityId": "boyun_co",
  "periodLabel": "FY2025-26 · 贷款 3",
  "scopeKey": "loan:3",
  "incomeYear": "FY2025-26",
  "deadlineFy": "FY2026-27",
  "statutoryDue": "2027-03-01",
  "effectiveDue": "2027-03-01",
  "status": "blocked",
  "notes": "{\"loanId\":3,\"assessment\":{\"status\":\"blocked\",\"missingInputs\":[\"agreement signed date\",\"agreement document\",\"agreement terms status\",\"agreement interest rate\",\"security type\"]},\"lodgmentDay\":\"2027-03-01\",\"benchmarkRate\":\"8.37%\"}"
}
```

这证明两笔贷款不会共用同一条义务。`2027-03-01` 是公司税表实际生效截止日；协议义务没有再套 BAS 两周延期或额外周末顺延。

## 3. `.ics` 摘录：`GET /api/calendar/export?fy=2026-27`

实际日历事件包含：

```text
SUMMARY:Boyun Pty Ltd · Div 7A 协议截止义务 · FY2025-26 · 贷款 3
DTSTART;VALUE=DATE:20270301
DTEND;VALUE=DATE:20270302
DESCRIPTION:法定日: 01 Mar 2027\n实际日: 01 Mar 2027\n状态: blocked\n入口: https://www.ato.gov.au/law/view/document?LocID=%22PAC%2F19360027%2F109N%281%29%28b%29%22
```
