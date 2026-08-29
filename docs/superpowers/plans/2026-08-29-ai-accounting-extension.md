# 高级 AI 会计副驾扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有澳洲多主体税务合规看板之上，按严格 Gate 顺序增加 Div 7A 主干、轻量资产折旧、车辆税务事实分析、PSI 门槛和三个保守规划情景，同时保留手动 BAS、提醒、操作指引和监管资讯能力。

**Architecture:** 账本、BAS、年度、Div 7A、资产、PSI 和规划数字由 `lib/domain` 中的确定性服务计算；页面通过 Route Handlers 读写已校验的 domain input。AI 只能解释已生成的快照，所有敏感输入在 `lib/ai` 脱敏后缓存，规划确认只建立独立快照/待办/审计记录，不写交易、义务或已递交底稿。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Drizzle ORM、better-sqlite3、date-fns/date-fns-tz、Decimal.js、Zod、Vitest、Playwright、SQLite。

**Spec:** `docs/superpowers/specs/2026-08-29-ai-accounting-extension-design.md`

## Global Constraints

- 本轮只写设计和计划，不开始任何实现；用户确认后仍按 Gate 5 → Gate 6 → Gate 7 → Gate 8 → Gate 9 → Gate 10 → Gate 11 执行。
- 每个 Gate 完成后硬停止，等待用户明确验收；未验收不得开始下一个 Gate，不提前创建下一个 Gate 的标签。
- 所有业务日期使用 IANA `Australia/Melbourne` 和 `date-fns-tz`；禁止固定 UTC 偏移和服务器 locale 日期顺序。
- 只读日期固定 `DD MMM YYYY`；输入固定 `DD/MM/YYYY`；输入和输出均不得依赖浏览器 locale。
- 所有金额以整数分存储和计算；不得用浮点金额、`parseFloat`、`toFixed` 或 `/100` 后参与计算。
- Div 7A 利率不是金额，用精确字符串/Decimal；每个所得年度必须有人工核对的 ATO 来源 URL 和取数日期，缺失不得回退。
- 不保存 TFN；AI payload 和 `ai_cache.redacted_input_json` 不得包含 TFN、银行账号或完整地址。
- AI 不得未经用户确认写入 `transactions`、`obligations`、BAS 金额、年度底稿或状态。
- 不向 ATO/ASIC 自动申报或付款；用户手动完成政府网站操作。
- 已 `lodged`/`paid` 的 worksheet 不可修改；关账期新交易必须走独立队列和审计选择。
- `blocked` 逐义务判断；缺 ASIC 配置不能阻塞 BAS/公司税表；`adjustment_direction` 按规则区分 `forward` 与 `backward`。
- Simpler BAS 指引只显示 G1/1A/1B；G10/G11 只内部核算并标注“不填入 ATO 表单”；G1 指引必须选择“该金额是否含 GST”为“是”。
- PAYG 5A/5B 只接受用户手动录入；公式为 `statementTotal = gstNet + 5A - 5B`，允许负值；显式“本期无 PAYG 分期”写入 0/0。
- BAS 和年度底稿按 `income_year` 正确聚合；年度收入、运营费用、资本采购按不含 GST 口径。
- 原始 Gate 0–4 的证据目录不能修改；新证据只写入相应的 `docs/evidence/gateN/`。
- 窄屏浏览器只验证响应式布局，不声称验证真实手机拍照/相机权限/手机上传流程。

## 文件结构和职责

### 现有文件将继续承担的职责

- `lib/db/schema.ts`、`lib/db/migrate.ts`、`lib/db/seed.ts`：SQLite schema、迁移和来源带日期的参考数据。
- `lib/domain/div7a/formula.ts`、`lib/domain/div7a/service.ts`：Div 7A 精确计算和逐年摘要。
- `lib/domain/obligations/{rules,calculator,expand,repository,reminders,ics}.ts`：义务规则、日期、提醒、`.ics`。
- `lib/domain/annual/{shared,company,trust,personal}.ts`：按 `income_year` 的年度底稿和不含 GST金额口径。
- `lib/domain/super/{constants,service}.ts`：按年度上限和供款/notice 双待办。
- `lib/ai/{adapter,cache,redact,types,fallback}.ts`：脱敏、缓存、关闭降级和解释。
- `lib/news/{config,fetch,prescreen,analysis,sources}.ts`：真实来源、日期窗口、关键词预筛和资讯错误隔离。
- `app/{annual,div7a,super,news,settings}/`、`components/`：现有页面和可复用控件。

### 扩展文件边界

- `lib/domain/div7a/rates.ts`：按所得年度解析利率及来源完整性。
- `lib/domain/div7a/agreement.ts`：贷款协议条件和 lodgment day 计算。
- `lib/domain/assets/{types,service,formula}.ts`：轻量资产登记和整数折旧。
- `lib/domain/psi/{types,service}.ts`：PSI 来源录入和三项测试所需的确定性服务。
- `lib/domain/planning/{types,service,guards}.ts`：三种规划情景、门控和结果快照。
- `app/api/assets/route.ts`、`app/api/psi/route.ts`、`app/api/planning/route.ts`：只接收 Zod 校验后的 domain input。
- `app/assets/page.tsx`、`app/psi/page.tsx`、`app/planning/page.tsx`：自管用户可核对的页面。
- `components/assets/`、`components/psi/`、`components/planning/`：表单、来源、假设和风险展示。
- `tests/fixtures/div7a/benchmark-rates.json`、`tests/fixtures/planning/`：外部来源/确定性输入 fixture，不复制实现结果。
- `docs/evidence/gate6/` 至 `docs/evidence/gate11/`：每个新 Gate 的独立 SQL、API、浏览器和报告证据。

## Gate 5 基线收口（既有授权）

本任务开始后，先完成上一轮已经授权的三项修复；不新增范围、不修改与口径无关的测试断言。

### Task 0: 关闭 Gate 5 三项既有缺陷

**Files:**
- Modify: `lib/domain/annual/shared.ts`
- Modify: `lib/domain/annual/company.ts`
- Modify: `lib/domain/annual/trust.ts`
- Modify: `lib/domain/annual/personal.ts`
- Modify: `components/annual/company-worksheet.tsx`
- Modify: `components/annual/personal-summary.tsx`
- Modify: `components/annual/trust-resolution-form.tsx`
- Modify: `lib/domain/div7a/formula.ts`
- Modify: `lib/domain/div7a/service.ts`
- Modify: `components/annual/div7a-loan-card.tsx`
- Modify: `app/api/obligations/[id]/transition/route.ts`
- Test: `tests/unit/annual-worksheets.test.ts`
- Test: `tests/unit/div7a.test.ts`
- Test: `tests/unit/obligation-state.test.ts`

**Interfaces:**
- `buildCompanyTaxWorksheet(entityId: string, incomeYear: string)` returns income, operating expense and capital purchase in cents excluding GST.
- `getDiv7aLoanSummary(loanId: number, assessmentIncomeYear: string)` returns the rolled-forward opening/closing balance, interest, actual repayment, minimum repayment and shortfall.
- `transitionObligation(id, { status, lodgedAt?, paidAt? })` persists the user-supplied dates and records the state change in `audit_log`.

- [ ] **Step 1: Write/retain the failing regression cases** for a `$1,100` GST-inclusive sale (`G1 = 110,000`, annual income `100,000`), a no-repayment/actual-repayment Div 7A sequence, and user-entered lodged/paid dates.
- [ ] **Step 2: Run the three focused tests and record existing failures** without changing expected literals.
- [ ] **Step 3: Implement only the three authorized fixes**: subtract `gst_cents` for annual lines, advance Div 7A balance using interest minus actual repayment, and write date fields from validated user input.
- [ ] **Step 4: Run focused tests, then full test, lint and build**; the official Div 7A fixture must remain source-backed.
- [ ] **Step 5: Run the original Gate 5 annual evidence flow** and write only new Gate 5 evidence files; do not modify earlier Gate evidence.
- [ ] **Step 6: Stop for Gate 5 acceptance; do not create `gate-5` tag.** Gate 6 cannot start without explicit acceptance.

## Gate 6 — Div 7A 完整化

### Task 1: Annual benchmark-rate schema and provenance

**Files:**
- Create: `drizzle/0007_div7a_annual_rates_and_scopes.sql`
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/relations.ts`
- Modify: `lib/db/migrate.ts`
- Modify: `lib/db/seed.ts`
- Create: `lib/domain/div7a/rates.ts`
- Create: `tests/fixtures/div7a/benchmark-rates.json`
- Create: `tests/unit/div7a-rates.test.ts`

**Interfaces:**

```ts
export type Div7aBenchmarkRate = {
  incomeYear: string;
  rateText: string;
  sourceUrl: string;
  retrievedAt: string;
};

export function getBenchmarkRateForIncomeYear(incomeYear: string): Div7aBenchmarkRate | null;
export function assertBenchmarkRateSource(rate: Div7aBenchmarkRate): void;
```

- [ ] **Step 1: Add failing tests** for a rate row containing source URL/date, a missing year returning `null`, and a rate text parsed by Decimal rather than a binary float.
- [ ] **Step 2: Run `npm test -- tests/unit/div7a-rates.test.ts`** and confirm the new table/service contract is absent.
- [ ] **Step 3: Add `div7a_benchmark_rates`** with one row per income year; make `rate_text`, URL and retrieval date mandatory; make existing loan rate legacy-only in domain code.
- [ ] **Step 4: Seed only ATO-verified rows** from `tests/fixtures/div7a/benchmark-rates.json`; fixture entries contain URL and retrieval date, not expected values generated by the formula.
- [ ] **Step 5: Run migration twice and focused tests**; missing rate must make the caller unresolved, never use a neighboring year.
- [ ] **Step 6: Commit only this schema/rate slice** with `git commit -m "feat: store Div 7A rates by income year"`.

### Task 2: Agreement deadline and loan-specific obligation

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `drizzle/0007_div7a_annual_rates_and_scopes.sql`
- Create: `lib/domain/div7a/agreement.ts`
- Modify: `lib/domain/div7a/service.ts`
- Modify: `lib/domain/obligations/rules.ts`
- Modify: `lib/domain/obligations/expand.ts`
- Modify: `lib/domain/obligations/repository.ts`
- Modify: `lib/domain/obligations/reminders.ts`
- Create: `tests/unit/div7a-agreement.test.ts`
- Test: `tests/unit/reminders.test.ts`

**Interfaces:**

```ts
import type { DateOnly } from "@/lib/time/melbourne";
import type { ObligationView } from "@/lib/domain/obligations/repository";

export type LodgmentDayInput = {
  companyTaxDue: DateOnly;
  companyTaxLodgedAt: DateOnly | null;
};

export type AgreementInput = {
  agreementSignedAt: DateOnly | null;
  agreementDocumentId: number | null;
  agreementTermsStatus: "unknown" | "compliant" | "not_compliant" | "needs_review";
  securityType: "unsecured" | "registered_mortgage" | "unknown";
  loanDate: DateOnly;
  loanIncomeYear: string;
  loanTermYears: number;
  benchmarkRate: string | null;
  lodgmentDay: DateOnly | null;
};

export type AgreementAssessment = {
  status: "compliant" | "not_compliant" | "blocked";
  missingInputs: string[];
  reasons: string[];
};

export function companyLodgmentDay(input: LodgmentDayInput): DateOnly;
export function assessAgreementCompliance(input: AgreementInput): AgreementAssessment;
export function expandDiv7aAgreementObligation(loanId: number): ObligationView;
```

- [ ] **Step 1: Add tests** for `min(actual lodged date, due date)`, no default current date, agreement signed after lodgment day, missing terms, and one obligation per loan using `scope_key = loan:<id>`.
- [ ] **Step 2: Run the focused tests** and verify they fail before implementation.
- [ ] **Step 3: Add agreement fields and the `div7a_loan_agreement` rule**; the rule uses the exact lodgment day and does not apply generic BAS two-week or weekend shifting.
- [ ] **Step 4: Recompute the obligation when the company tax obligation receives a user-entered `lodged_at`**; write the change to `audit_log`.
- [ ] **Step 5: Add T-30/T-10/T-3/today/daily-overdue reminders and `.ics` coverage** for the independent agreement obligation.
- [ ] **Step 6: Run agreement/reminder tests, SQL inspection and lint**; commit `feat: track Div 7A agreement deadline`.

### Task 3: Div 7A UI, shortfall, expiry and evidence

**Files:**
- Modify: `lib/domain/div7a/formula.ts`
- Modify: `lib/domain/div7a/service.ts`
- Modify: `app/api/div7a/route.ts`
- Modify: `components/annual/div7a-loan-card.tsx`
- Modify: `components/annual/div7a-page-client.tsx`
- Create: `tests/unit/div7a-rollforward.test.ts`
- Modify: `tests/unit/div7a.test.ts`
- Create: `tests/e2e/gate6-div7a.spec.ts`
- Create: `docs/evidence/gate6/report.md`
- Create: `docs/evidence/gate6/div7a-five-year.png`
- Create: `docs/evidence/gate6/div7a-agreement.png`

**Interfaces:**

```ts
export type Div7aYearBreakdown = {
  incomeYear: string;
  openingBalanceCents: number;
  interestCents: number | null;
  minimumRepaymentCents: number | null;
  actualRepaymentCents: number;
  closingBalanceCents: number | null;
  shortfallCents: number | null;
  remainingTermYears: number | null;
  status: "origination" | "active" | "expired" | "manual_review";
};
```

- [ ] **Step 1: Add a regression test** where the same loan is evaluated for five consecutive years: origination year zero, active years with distinct results, and expiry after the contractual term.
- [ ] **Step 2: Add the repayment-vs-no-repayment test**; in year three both balance and minimum repayment must differ.
- [ ] **Step 3: Keep the ATO official baseline fixture** and test its expected value only by loading `tests/fixtures/div7a/ato-baseline.json`; the test comment must identify the ATO calculator URL and retrieval date.
- [ ] **Step 4: Implement the UI/API breakdown** with rate source, agreement deadline, shortfall warning, expiry text, opening/interest/actual/closing values, and no inferred dividend record.
- [ ] **Step 5: Execute `npm test -- tests/unit/div7a.test.ts tests/unit/div7a-rollforward.test.ts`, `npm run test:e2e -- tests/e2e/gate6-div7a.spec.ts`, `npm run lint`, and `npm run build`.**
- [ ] **Step 6: Inspect every screenshot and SQL output; write the Gate 6 report; stop and wait for acceptance.** Create `gate-6` only after acceptance.

## Gate 7 — 轻量资产登记和折旧

### Task 4: Asset schema, integer formulas and service

**Files:**
- Create: `drizzle/0008_assets.sql`
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/relations.ts`
- Create: `lib/domain/assets/types.ts`
- Create: `lib/domain/assets/formula.ts`
- Create: `lib/domain/assets/service.ts`
- Create: `tests/unit/assets.test.ts`

**Interfaces:**

```ts
import type { DateOnly } from "@/lib/time/melbourne";

export type AssetMethod = "prime_cost" | "diminishing_value";

export type AssetInput = {
  entityId: string;
  name: string;
  purchaseDate: DateOnly;
  availableForUseDate: DateOnly | null;
  costExGstCents: number;
  usefulLifeYears: number;
  method: AssetMethod;
  privateUsePercent: number;
  accumulatedDepreciationCents: number;
  bookValueCents: number;
};

export type DepreciationResult = {
  incomeYear: string;
  grossDepreciationCents: number;
  businessUseDepreciationCents: number;
  closingBookValueCents: number;
  status: "calculated" | "manual_review";
  reviewItems: string[];
};

export function depreciationForIncomeYear(asset: AssetInput, incomeYear: string): DepreciationResult;
export function businessUseDepreciationCents(grossCents: number, privateUsePercent: number): number;
```

- [ ] **Step 1: Add tests** for integer fields, GST-exclusive cost, 0–100 private-use validation, prime cost days, diminishing value opening book, rounding, and book-value invariant.
- [ ] **Step 2: Run `npm test -- tests/unit/assets.test.ts`** and confirm the table/service does not exist.
- [ ] **Step 3: Add one asset table and service**; reject negative/unsafe cents, percentages outside 0–100, missing method/life/date, and mismatched book value.
- [ ] **Step 4: Implement only the declared light formulas** with integer/rational arithmetic and explicit `manual_review` for special depreciation regimes; do not add CGT, pooling or balancing adjustments.
- [ ] **Step 5: Run focused tests, migration smoke test and lint**; commit `feat: add light asset register`.

### Task 5: Annual worksheet integration and UI

**Files:**
- Modify: `lib/domain/annual/shared.ts`
- Modify: `lib/domain/annual/company.ts`
- Modify: `lib/domain/annual/trust.ts`
- Modify: `lib/domain/annual/personal.ts`
- Create: `lib/domain/annual/export.ts`
- Modify: `app/api/annual/route.ts`
- Create: `app/assets/page.tsx`
- Create: `app/api/assets/route.ts`
- Create: `components/assets/asset-register.tsx`
- Modify: `components/annual/company-worksheet.tsx`
- Modify: `components/annual/personal-summary.tsx`
- Modify: `components/annual/trust-resolution-form.tsx`
- Create: `tests/unit/annual-assets.test.ts`
- Create: `tests/e2e/gate7-assets.spec.ts`
- Create: `docs/evidence/gate7/report.md`

**Interfaces:**
- Annual worksheet result adds `assetDepreciationCents`, `businessUseDepreciationCents`, and `depreciationReviewItems`.
- The derived depreciation line is read-only; any manual exception is a separate audited adjustment, not a second copy of the same amount.

- [ ] **Step 1: Add the annual integration test** for a GST-inclusive asset invoice and private-use percentage; assert annual amounts are not grossed up by GST.
- [ ] **Step 2: Implement the asset page/API** with fixed date input, integer cents display, source/notes, and book-value invariant.
- [ ] **Step 3: Feed asset depreciation into all applicable annual worksheets by `income_year`** and label it “不含 GST；轻量管理计算，需人工核对”。
- [ ] **Step 4: Verify company/trust/individual supplementary lists** remain type-specific; individuals do not receive company/trust fields.
- [ ] **Step 5: Run unit/e2e/lint/build and inspect the Gate 7 screenshot/export**; write evidence and stop for acceptance.

## Gate 8 — 车辆 FBT/Div 7A 事实分析（无自动判定代码）

### Task 6: Deliver the analysis artifact and evidence template

**Files:**
- Create: `docs/superpowers/specs/2026-08-29-vehicle-tax-analysis.md`
- Create: `docs/evidence/gate8/report.md`
- Create: `docs/evidence/gate8/vehicle-analysis.png`
- Modify: `docs/superpowers/specs/2026-08-29-ai-accounting-extension-design.md` only if an official source URL or retrieval date must be corrected

**Interfaces:** None; this Gate is documentation and a user-fillable fact checklist only. No `fbt_annual_return` row, route, or automatic path selection is implemented here.

- [ ] **Step 1: Record the official ATO sources** for FBT year, return/payment deadline, quarterly instalments, logbook/odometer requirements, and Div 7A asset-use payment conditions, with retrieval date 2026-08-29.
- [ ] **Step 2: Write the two-column analysis** listing trigger, required evidence, annual period, deadline, and uncertainty for FBT and Div 7A; explicitly state that both may need review.
- [ ] **Step 3: Add the vehicle fact checklist** for role, availability, private/business kilometres, costs, employee payment, logbook, odometer and agreement facts.
- [ ] **Step 4: Run a documentation link check and manually inspect the rendered artifact**; do not write business code.
- [ ] **Step 5: Submit Gate 8 report and stop for acceptance.**

## Gate 9 — PSI 定性向导

### Task 7: PSI schema and deterministic tests

**Files:**
- Create: `drizzle/0009_psi_assessments.sql`
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/relations.ts`
- Create: `lib/domain/psi/types.ts`
- Create: `lib/domain/psi/service.ts`
- Create: `tests/unit/psi.test.ts`

**Interfaces:**

```ts
export type TriState = "yes" | "no" | "unknown";
export type PsiAssessmentResult = {
  incomeIsPsi: TriState;
  resultsTest: TriState;
  eightyPercentRule: TriState;
  unrelatedClientsTest: TriState;
  psiRulesApply: TriState;
  psbStatus: "yes" | "no" | "unknown";
  missingInputs: string[];
};

export type PsiAssessmentInput = {
  entityId: string;
  incomeYear: string;
  incomeIsPsi: TriState;
  sources: Array<{
    amountCents: number;
    related: TriState;
    publicOfferDirect: TriState;
    contractForResult: TriState;
    ownTools: TriState;
    liableForRectification: TriState;
  }>;
};

export function assessPsi(input: PsiAssessmentInput): PsiAssessmentResult;
```

- [ ] **Step 1: Add tests** for results test 75% coverage/all three limbs, 80% at exactly 80%, unrelated clients + public offer, related client exclusion, and unknown propagation.
- [ ] **Step 2: Run the focused tests** and verify the service is absent.
- [ ] **Step 3: Add source-level PSI rows and per-company/year assessment rows**; reject negative/unsafe cents and never accept TFN fields.
- [ ] **Step 4: Implement the requested three tests only**; do not infer PSI from transaction descriptions or add defaults for other PSB tests.
- [ ] **Step 5: Run unit tests and migration smoke test**; commit `feat: add PSI assessment gate`.

### Task 8: PSI UI and planning gate

**Files:**
- Create: `app/psi/page.tsx`
- Create: `app/api/psi/route.ts`
- Create: `components/psi/psi-assessment-form.tsx`
- Create: `components/psi/psi-result-card.tsx`
- Create: `tests/e2e/gate9-psi.spec.ts`
- Create: `docs/evidence/gate9/report.md`
- Create: `docs/evidence/gate9/psi-assessment.png`

- [ ] **Step 1: Build the per-company/year form** with evidence fields, three-state controls and missing-input list.
- [ ] **Step 2: Display PSI/PSB results and source links**; never label unknown as pass/fail.
- [ ] **Step 3: Add the planning guard** so PSI rules apply gives `not_applicable` for retain-company-profit and unknown gives `needs_more_data`.
- [ ] **Step 4: Run e2e, unit, lint and build; inspect the screenshot at desktop and narrow width.**
- [ ] **Step 5: Write Gate 9 evidence and stop for acceptance.**

## Gate 10 — 三情景规划和保守 AI 解释

### Task 9: Planning schema, completeness guards and deterministic calculations

**Files:**
- Create: `drizzle/0010_planning_runs.sql`
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/relations.ts`
- Create: `lib/domain/planning/types.ts`
- Create: `lib/domain/planning/guards.ts`
- Create: `lib/domain/planning/service.ts`
- Create: `tests/unit/planning.test.ts`

**Interfaces:**

```ts
export type ScenarioId = "retain_company_profit" | "increase_super" | "repay_div7a";
export type ScenarioStatus = "ready" | "needs_more_data" | "not_applicable" | "manual_review";

export type PlanningInput = {
  entityId: string;
  incomeYear: string;
  scenarioId: ScenarioId;
  psiRulesApply: "yes" | "no" | "unknown";
  sourceSnapshot: Record<string, unknown>;
};

export type MissingInputResult = {
  complete: boolean;
  missingInputs: string[];
};

export type PlanningRunInput = {
  entityId: string;
  incomeYear: string;
  scenarios: PlanningInput[];
};

export type PlanningScenarioResult = {
  scenarioId: ScenarioId;
  entityId: string;
  incomeYear: string;
  status: ScenarioStatus;
  assumptions: string[];
  sources: Array<{ label: string; url: string; retrievedAt: string }>;
  includedFactors: string[];
  excludedFactors: string[];
  missingInputs: string[];
  taxBasis: string;
  estimatedTaxImpactCents: number | null;
  cashflowImpactCents: number | null;
  riskFlags: string[];
  notTaxAdvice: true;
  requiresUserConfirmation: true;
};

export function validateScenarioInputs(input: PlanningInput): MissingInputResult;
export function runPlanningScenario(input: PlanningInput): PlanningScenarioResult;
export function savePlanningRun(input: PlanningRunInput): number;
```

- [ ] **Step 1: Add tests** for all three scenarios, missing-input no-default behavior, PSI not-applicable behavior, source/assumption/exclusion fields, integer outputs and negative/unknown states.
- [ ] **Step 2: Run the focused planning tests** and verify the service is absent.
- [ ] **Step 3: Add snapshot tables and service**; store `income_year`, input hash, source URLs, retrieved dates, assumptions, excluded factors and `notTaxAdvice: true`.
- [ ] **Step 4: Implement only retain profit, increase super and repay Div 7A**; do not add dividend/CGT/shareholder paths.
- [ ] **Step 5: Ensure no planner function imports a transaction/obligation write service**; add a static code check/test for the write boundary.
- [ ] **Step 6: Run unit tests, migration smoke test, lint and build**; commit `feat: add conservative tax planning scenarios`.

### Task 10: Planning UI, AI explanation and user confirmation

**Files:**
- Create: `app/planning/page.tsx`
- Create: `app/api/planning/route.ts`
- Create: `app/api/planning/[id]/confirm/route.ts`
- Create: `components/planning/scenario-card.tsx`
- Create: `components/planning/assumptions-panel.tsx`
- Create: `components/planning/source-panel.tsx`
- Modify: `lib/ai/types.ts`
- Modify: `lib/ai/adapter.ts`
- Modify: `lib/ai/fallback.ts`
- Modify: `lib/ai/cache.ts`
- Create: `tests/unit/planning-ai-boundary.test.ts`
- Create: `tests/e2e/gate10-planning.spec.ts`
- Create: `docs/evidence/gate10/report.md`
- Create: `docs/evidence/gate10/planning.png`

- [ ] **Step 1: Add the boundary test** with an AI result containing a proposed amount; confirm it creates only a planning snapshot/`audit_log` entry and leaves transactions, obligations and worksheets unchanged.
- [ ] **Step 2: Add redaction/cache tests** for TFN, bank account and complete address in planning explanation input; inspect both outgoing payload and `ai_cache.redacted_input_json`.
- [ ] **Step 3: Implement deterministic scenario cards** showing assumptions, source URL/date, applicable year, excluded factors, missing data, risk flags and “不构成税务建议”。
- [ ] **Step 4: Implement optional AI explanation** using only redacted result snapshots; AI disabled/failed uses deterministic text and remains fully navigable.
- [ ] **Step 5: Implement confirmation as a separate route** that writes only snapshot status, independent planning task and audit metadata.
- [ ] **Step 6: Run e2e with AI disabled and enabled mock provider, unit tests, lint/build; inspect all screenshots.**
- [ ] **Step 7: Write Gate 10 evidence and stop for acceptance.**

## Gate 11 — 跨模块回归、条件 FBT 义务和交付

### Task 11: Regression and optional FBT rule after explicit user classification

**Files:**
- Modify: `lib/domain/obligations/rules.ts`
- Modify: `lib/domain/obligations/expand.ts`
- Modify: `lib/domain/obligations/reminders.ts`
- Modify: `lib/domain/obligations/ics.ts`
- Modify: `lib/domain/bas/instructions.ts`
- Modify: `lib/news/fetch.ts`
- Modify: `lib/news/prescreen.ts`
- Modify: `lib/news/analysis.ts`
- Create: `tests/unit/regression-baseline.test.ts`
- Create: `tests/e2e/gate11-regression.spec.ts`
- Create: `docs/evidence/gate11/report.md`

- [ ] **Step 1: Re-run reminders, ICS, CAV/ASIC, Simpler BAS guidance, PAYG, closed-period, CSV, bank-balance reconciliation, news and annual-worksheet regression tests.**
- [ ] **Step 2: Only if the user has explicitly recorded FBT as applicable after Gate 8**, add `fbt_annual_return` with FBT-year period `1 April–31 March`, the verified due date, separate `income_year` semantics and its own reminders; otherwise leave the path `unknown` and generate no FBT card.
- [ ] **Step 3: Verify the FBT route never changes BAS/annual tax obligations and never reuses 30 June due-date logic.**
- [ ] **Step 4: Run a clean database annual workflow** from import to BAS, annual worksheet, PSI gate, three scenarios, backup/restore and SQL diff.
- [ ] **Step 5: Run full unit tests twice, randomized order, e2e, lint and build; report actual counts, not a target baseline.**
- [ ] **Step 6: Inspect every evidence screenshot and export; write final report and stop for acceptance.**

## Verification and evidence protocol

For every Gate, the executor must produce:

1. focused unit test output and the full command output;
2. SQL output showing persisted values and source dates;
3. API response for the same values;
4. browser screenshot for the same values, inspected visually;
5. a report listing pass, partial verification and user-only verification separately.

Evidence paths are immutable after acceptance. New screenshots go only under their own Gate directory. A tag is created only after that Gate’s explicit user acceptance; this current design/plan commit creates no Gate tag.

## Plan self-review

- Scope coverage: Div 7A is Gate 6; assets Gate 7; vehicle analysis Gate 8; PSI Gate 9; the three planning scenarios and conservative AI controls Gate 10; reminders/licences/instructions/news and conditional FBT integration Gate 11; the three previously authorized Gate 5 fixes are Task 0.
- Omitted by design: dividends/share classes/solvency/board drafts, CGT, complete policy-version database, automatic ATO/ASIC filing, payroll/STP, and any automatic choice between FBT and Div 7A.
- Type consistency: all later tasks consume `PlanningScenarioResult`, `PsiAssessmentResult`, `Div7aYearBreakdown`, and `DepreciationResult` defined in earlier task interfaces; all amount fields end in `Cents` and are integers.
- No task is allowed to substitute a self-calculated number for an official ATO benchmark; missing official data produces an explicit unresolved state.
