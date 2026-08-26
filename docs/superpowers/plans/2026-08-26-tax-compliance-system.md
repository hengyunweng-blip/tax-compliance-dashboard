# 澳洲多主体税务合规看板系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按需求文档实现一个本地运行、可追溯、以整数分记账的 FY2026–27 澳洲多主体税务合规看板，并严格按 Gate 0–5 逐 Gate 交付和停机等待验收。

**Architecture:** 使用 Next.js 15 App Router 作为本地单体应用；页面、Route Handlers 和业务服务运行在同一个 Node 进程。Drizzle ORM + better-sqlite3 提供 SQLite schema、迁移和事务，`lib/domain` 承载日期、义务、BAS、年度、Div 7A 与养老金计算，`lib/ingest`、`lib/ai`、`lib/news` 分别处理数据入口、AI 降级和资讯。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS、shadcn/ui、Drizzle ORM、better-sqlite3、date-fns、date-fns-tz、Vitest、Playwright、Zod、csv-parse、sharp、Decimal.js。

**Spec:** `docs/superpowers/specs/2026-08-26-tax-compliance-system-design.md`；原始需求为 `/Users/neilweng/Downloads/tax-compliance-system-spec.md`。

## Global Constraints

- 所有 Gate 独立运行、独立测试、独立验收；当前 Gate 完成后立即停止，不得跨 Gate 写代码。
- 所有业务日期使用 IANA 时区 `Australia/Melbourne`；禁止固定 UTC 偏移和 UTC 日期比较；使用 `date-fns-tz`。
- 所有金额用整数分存储和计算；禁止用浮点数保存或累加金额，最终显示才转换为澳元字符串。
- 必须实现 `POST /api/ingest/email`，支持 multipart 与 base64，并使用 `.env.local` 的 `INGEST_TOKEN` 校验。
- 必须实现 `audit_log` 和 `ai_cache`；AI 缓存键为脱敏 canonical input 的 SHA-256，缓存不得保存未脱敏秘密。
- 三家公司按 Simpler BAS 处理：ATO 操作指引只列 G1、1A、1B；G10/G11 可内部计算和存储，但 UI 必须标注“内部核算用，不填入 ATO 表单”。
- `bas_worksheets.payg_instalment_cents` 保留为整数分兼容字段；权威输入拆为可空整数分 `payg_5a_cents` 与 `payg_5b_cents`，只接受用户从 ATO 预填的 5A/5B 手动录入，系统不推算 PAYG。`BasSummary` 必须区分 `gstNetCents`、`payg5aCents`、`payg5bCents` 和 `statementTotalCents`，公式为 `gstNetCents + payg5aCents - payg5bCents`，已递交金额校验使用后者；显式确认「本期无 PAYG 分期」写入 5A=0、5B=0。
- `obligations.income_year` 与 `deadline_fy` 独立保存；卡片和底稿标题显示所属所得年度，截止日所在财年不作为所属年度。
- 必须为义务日期、GST 到 BAS 标签、Div 7A 最低还款额编写单元测试，并在对应 Gate 报告中单独列出。
- 不做 ATO/ASIC 自动申报，不保存 TFN，不做多用户、权限、云端、STP、工资单或信托账户管理。
- 自动化浏览器只验证桌面和窄屏响应式；不声称验证真实手机摄像头或真实手机拍照权限。
- 已递交/已缴款 BAS 期间的新交易必须标记原 worksheet、进入 Inbox 独立队列，并在生成下一期 BAS 时要求选择并审计处理方式；不得自动修改已递交 worksheet。
- 每个 Gate 的浏览器截图和运行报告只能写入自己的 `docs/evidence/gateN/` 目录；已验收 Gate 的证据不得覆盖或删除。
- 每个 Gate 的停止点是硬门槛；未收到用户明确“验收通过”，不得开始下一 Gate。
- 密钥只从环境变量读取，不出现在命令行参数、日志、临时文件或 git 中。

## 文件结构总览

```text
app/
  page.tsx
  inbox/page.tsx
  entities/[id]/page.tsx
  obligations/[id]/page.tsx
  bas/[obligationId]/page.tsx
  annual/page.tsx
  div7a/page.tsx
  super/page.tsx
  news/page.tsx
  settings/page.tsx
  import/page.tsx
  api/health/route.ts
  api/settings/route.ts
  api/obligations/route.ts
  api/calendar/export/route.ts
  api/ingest/email/route.ts
  api/documents/route.ts
  api/import/csv/route.ts
  api/bas/[obligationId]/route.ts
  api/backup/route.ts
  api/restore/route.ts
components/
  ui/...
  dashboard/...
  settings/...
  obligations/...
  ledger/...
  bas/...
  annual/...
lib/
  db/{client,schema,relations,migrate,seed}.ts
  time/{melbourne,holidays}.ts
  money.ts
  constants/{entities,gst,accounts}.ts
  domain/obligations/{rules,calculator,expand,state-machine,reminders}.ts
  domain/bas/{gst-mapping,calculator,generator,export}.ts
  domain/annual/{company,trust,personal}.ts
  domain/div7a/{formula,service}.ts
  domain/super/service.ts
  ingest/{documents,email,csv,transactions,inbox}.ts
  rules/classification.ts
  ai/{config,redact,cache,adapter,fallback}.ts
  news/{sources,fetch,prescreen,analysis}.ts
  validation.ts
tests/{unit,e2e}/...
```

## Gate 0 — 骨架、全量 schema、seed、设置页

Gate 0 只交付应用骨架、全量数据库表、固定种子、时间常量、配置服务和设置页。Gate 0 完成后必须停止；不要在本 Gate 生成具体 obligations、看板卡片、交易入口或 BAS。

### Task 0.1: 初始化 Next.js 与测试工具

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `components.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `app/layout.tsx`
- Create: `app/api/health/route.ts`
- Create: `tests/unit/health.test.ts`

**Interfaces:**
- Produces `GET /api/health` returning `{ ok: true, database: "connected" }` after the database client is available.
- Produces npm scripts: `dev`, `build`, `start`, `lint`, `test`, `test:watch`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`.

- [ ] **Step 1: Write the failing health test**

```ts
import { expect, test } from "vitest";
import { GET } from "@/app/api/health/route";

test("health route reports an available database", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, database: "connected" });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/unit/health.test.ts`

Expected: FAIL because the Next.js project and health route do not exist.

- [ ] **Step 3: Create the minimum project files and install only the declared dependencies**

Use npm dependencies compatible with the required stack: `next@15`, `react`, `react-dom`, `typescript`, `drizzle-orm`, `better-sqlite3`, `drizzle-kit`, `date-fns`, `date-fns-tz`, `zod`, `vitest`, `@vitejs/plugin-react`, `@playwright/test`, `tailwindcss`, `postcss`, `autoprefixer`, `lucide-react`, `clsx`, `tailwind-merge`, `csv-parse`, `sharp`, and `decimal.js`. Pin versions in `package-lock.json` after install.

Set `.env.example` to contain variable names only:

```dotenv
DATABASE_PATH=./data/app.db
INGEST_TOKEN=
AI_API_KEY=
```

Add `.env.local`, `data/`, `data/files/`, `.next/`, and generated artifacts to `.gitignore`; never put actual secrets in either tracked file or command arguments.

- [ ] **Step 4: Implement the health route and app shell**

`app/api/health/route.ts` must import the database singleton, call a one-row `SELECT 1`, and return the exact JSON contract above. `app/layout.tsx` must render a Chinese app shell without doing any network fetch during initial render.

- [ ] **Step 5: Run unit test, lint, and a production build**

Run: `npm test -- tests/unit/health.test.ts && npm run lint && npm run build`

Expected: PASS, no lint errors, and a successful Next.js production build.

- [ ] **Step 6: Commit the Gate 0 scaffold slice**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts components.json vitest.config.ts playwright.config.ts .env.example .gitignore app tests
git commit -m "chore: scaffold local tax compliance app"
```

### Task 0.2: Create the complete Drizzle schema and database lifecycle

**Files:**
- Create: `drizzle.config.ts`
- Create: `lib/db/client.ts`
- Create: `lib/db/schema.ts`
- Create: `lib/db/relations.ts`
- Create: `lib/db/migrate.ts`
- Create: `lib/db/seed.ts`
- Create: `drizzle/0000_initial.sql`
- Create: `tests/unit/db-schema.test.ts`

**Interfaces:**
- `getDb(): BetterSQLite3Database<typeof schema>` returns the process-local database.
- `runMigrations(): void` creates `./data/app.db` and applies Drizzle migrations.
- `seedDatabase(db): void` is idempotent and inserts fixed reference rows only when absent.

- [ ] **Step 1: Write schema contract tests**

```ts
import { expect, test } from "vitest";
import { tableNames, amountColumns } from "@/lib/db/schema";

test("schema contains all required business and audit tables", () => {
  expect(tableNames).toEqual(expect.arrayContaining([
    "entities", "licences", "accounts", "transactions", "documents",
    "obligation_rules", "obligations", "reminders", "bas_worksheets",
    "div7a_loans", "super_contributions", "news_sources", "news_items",
    "news_analyses", "settings", "audit_log", "ai_cache",
    "csv_mapping_templates",
  ]));
});

test("monetary columns are integer database columns", () => {
  expect(amountColumns.every((column) => column.dataType === "number")).toBe(true);
  expect(amountColumns.every((column) => column.columnType === "INTEGER")).toBe(true);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/unit/db-schema.test.ts`

Expected: FAIL because schema and table metadata are not defined.

- [ ] **Step 3: Define all tables, indexes, foreign keys, and uniqueness constraints**

Implement the logical schema from the requirements. Use text primary keys for fixed entity/rule IDs, integer primary keys for event rows, date-only strings for business dates, and integer columns for every money field. Add `obligations.income_year` for the obligation's income year and `obligations.deadline_fy` for the fiscal year containing `effective_due`; they are required for every expanded obligation, including BAS. Keep `bas_worksheets.payg_instalment_cents` as a nullable integer compatibility column and add nullable integer-cent `payg_5a_cents` / `payg_5b_cents` columns for the authoritative split input. Add unique constraints for `documents.sha256`, `(rule_id, entity_id, period_label)`, `(method, input_sha256)`, and bank mapping identity. `ai_cache.redacted_input_json` must never contain the original payload.

- [ ] **Step 4: Implement database pragmas and migrations**

`getDb()` must create the parent directory, open the configured path, and execute `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, and `PRAGMA busy_timeout = 5000`. `runMigrations()` must be safe to run more than once and must not delete an existing database.

- [ ] **Step 5: Run schema tests and migration smoke test**

Run: `npm test -- tests/unit/db-schema.test.ts && npm run db:migrate && npm run db:migrate`

Expected: both test runs pass; both migration runs complete without duplicate-table errors; `data/app.db` exists.

- [ ] **Step 6: Commit the schema slice**

```bash
git add drizzle.config.ts lib/db drizzle tests/unit/db-schema.test.ts
git commit -m "feat: add complete local compliance schema"
```

### Task 0.3: Add constants, Melbourne date foundation, seed data, and settings persistence

**Files:**
- Create: `lib/time/melbourne.ts`
- Create: `lib/time/holidays.ts`
- Create: `lib/money.ts`
- Create: `lib/constants/entities.ts`
- Create: `lib/constants/gst.ts`
- Create: `lib/constants/accounts.ts`
- Modify: `lib/db/seed.ts`
- Create: `lib/settings.ts`
- Create: `app/settings/page.tsx`
- Create: `app/api/settings/route.ts`
- Create: `components/settings/entity-config-form.tsx`
- Create: `tests/unit/money.test.ts`
- Create: `tests/unit/settings.test.ts`

**Interfaces:**
- `MELBOURNE_TIME_ZONE: "Australia/Melbourne"` is the only business timezone export.
- `parseMoneyToCents(input: string): number` accepts a decimal money string and rejects non-finite, more-than-two-decimal, unsafe, or non-numeric values without using floating arithmetic.
- `formatCents(cents: number): string` formats an integer number of cents as AUD.
- `saveEntityConfiguration(input): Entity` persists ACN, incorporation date, ASIC review date, GST flag, and active state; it rejects TFN fields.
- `GET /api/settings` returns safe entity/licence/settings data; `PATCH /api/settings` validates with Zod and persists within a transaction.

- [ ] **Step 1: Write exact money and settings tests**

```ts
import { expect, test } from "vitest";
import { parseMoneyToCents } from "@/lib/money";

test.each([
  ["0", 0], ["12", 1200], ["12.3", 1230], ["12.34", 1234], ["-12.34", -1234],
])("parses %s as integer cents", (input, expected) => {
  expect(parseMoneyToCents(input)).toBe(expected);
});

test.each(["1.234", "AUD 1", "", "1e3", "NaN"])("rejects unsafe money string %s", (input) => {
  expect(() => parseMoneyToCents(input)).toThrow();
});
```

`tests/unit/settings.test.ts` must prove that saving `boyun_co` ACN and ASIC review date survives a fresh database read and that a `tfn` property is rejected and never inserted.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/unit/money.test.ts tests/unit/settings.test.ts`

Expected: FAIL because the exact-string money parser and settings service are absent.

- [ ] **Step 3: Implement date, money, constants, and seed data**

Use `date-fns-tz` with the literal IANA zone. Do not introduce a fixed offset constant. Add the GST code list, six entities, one licence row, account templates, obligation rule seed rows, initial news sources, settings defaults, and the FY2026–27 concessional cap `3_250_000` cents.

Hard-code the 2026 and known 2027 Victorian holiday dates in `lib/time/holidays.ts`, with a comment requiring annual update and an explicit note that the 2027 AFL Grand Final Friday is pending the official schedule. No date calculation may silently substitute a guessed date.

Seed the rule metadata so that FY2026–27 BAS obligations have `income_year = FY2026-27` and annual tax rules later expand with `income_year = FY2025-26` while assigning `deadline_fy` from the actual due date.

- [ ] **Step 4: Implement settings API and responsive settings page**

The page must show the fixed six entities (`self`, `spouse`, `boyun_trust`, `boyun_co`, `yeeliving_co`, `neighbourhood_co`) and their configuration status. Render ACN, ASIC review date and GST controls only for `company` entities; for `individual` and `trust`, render three “不适用” values with no inputs and never show “待配置”. The pure status function must keep individual/trust rows `ready` when company identifiers are absent, while companies remain `blocked` until their applicable fields are present. Keep the one `self`-held licence's number and anniversary date on the separate licence tab; the entity table must not have a licence column. Do not render a subject/workspace switcher or a “私人工作区” footer. Never render or accept a TFN field.

- [ ] **Step 5: Run tests, seed, and verify persistence through the real route**

Run: `npm test -- tests/unit/money.test.ts tests/unit/settings.test.ts && npm run db:seed && npm run build`

Then run `npm run db:seed`, start the app with `npm run dev`, capture `/settings` with the six real seeded names, use the real `PATCH /api/settings` path for `boyun_co`, reload `/settings`, and capture a second screenshot proving the ACN/ASIC anniversary persisted. Also report `SELECT id, name, type, gst_registered FROM entities ORDER BY sort_order;` output. This is the Gate 0 user-visible acceptance path; it does not claim real phone camera upload.

- [ ] **Step 6: Stop and request Gate 0 acceptance**

Do not create `app/page.tsx` dashboard cards, obligation expansion code, CSV import, document upload, transaction CRUD, BAS, news, AI, annual, Div 7A, super, or backup features in this Gate. Report the commands, database path, settings persistence result, and known limits, then wait for the user to explicitly accept Gate 0.

## Gate 1 — 义务引擎、状态机、看板与 `.ics`

Start this section only after the user explicitly accepts Gate 0. Stop after this section even if all tests pass; Gate 2 is forbidden until the user accepts the exact dates.

### Task 1.1: Implement Melbourne calendar utilities with TDD

**Files:**
- Modify: `lib/time/melbourne.ts`
- Modify: `lib/time/holidays.ts`
- Create: `lib/time/business-days.ts`
- Create: `tests/unit/melbourne-dates.test.ts`

**Interfaces:**
- `type DateOnly = \`${string}-${string}-${string}\``.
- `isMelbourneWeekend(date: DateOnly): boolean` uses the IANA-zone weekday.
- `isVictorianPublicHoliday(date: DateOnly): boolean` checks the hard-coded set.
- `nextMelbourneBusinessDay(date: DateOnly): DateOnly` moves forward until neither weekend nor holiday.
- `formatDueDate(date: DateOnly): string` returns `DD MMM YYYY`.
- All read-only dates in settings, cards, detail pages, BAS/annual worksheets, and exports use `formatDueDate`; date inputs use a custom `DD/MM/YYYY` control with an explicit format hint and never depend on browser locale.
- Unit tests must assert `formatDueDate("2026-07-15") === "15 Jul 2026"` both under the default test environment and with `en-US` locale settings.

- [x] **Step 1: Write failing tests for weekends, holidays, and DST-safe conversion**

```ts
import { expect, test } from "vitest";
import { nextMelbourneBusinessDay } from "@/lib/time/business-days";

test("moves a Saturday to the following Monday", () => {
  expect(nextMelbourneBusinessDay("2026-10-31")).toBe("2026-11-02");
});

test("moves a Victorian public holiday to the next business day", () => {
  expect(nextMelbourneBusinessDay("2026-11-03")).toBe("2026-11-04");
});

test("uses Australia/Melbourne across daylight-saving boundaries", () => {
  expect(nextMelbourneBusinessDay("2026-10-04")).toBe("2026-10-05");
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/unit/melbourne-dates.test.ts`

Expected: FAIL because business-day functions are not implemented.

- [x] **Step 3: Implement the pure functions with date-fns-tz**

Parse date-only values as Melbourne calendar dates, derive weekday with `toZonedTime`/`formatInTimeZone`, and return date-only strings. No function may compare a deadline by calling `new Date(dateString)` in the server’s default timezone.

- [x] **Step 4: Run the focused test and lint**

Run: `npm test -- tests/unit/melbourne-dates.test.ts && npm run lint`

Expected: PASS with no fixed-offset timezone constants.

### Task 1.2: Implement obligation rules, expansion, status transitions, and reminders

**Files:**
- Create: `lib/domain/obligations/rules.ts`
- Create: `lib/domain/obligations/calculator.ts`
- Create: `lib/domain/obligations/expand.ts`
- Create: `lib/domain/obligations/state-machine.ts`
- Create: `lib/domain/obligations/reminders.ts`
- Create: `tests/unit/obligation-calculator.test.ts`
- Create: `tests/unit/obligation-state.test.ts`

**Interfaces:**
- `calculateBasDueDates(fy: string, quarter: "Q1"|"Q2"|"Q3"|"Q4"): { incomeYear: string; deadlineFy: string; statutoryDue: DateOnly; effectiveDue: DateOnly }`.
- `calculateAnnualTaxDue(entity, context): { incomeYear: string; deadlineFy: string; statutoryDue: DateOnly; effectiveDue: DateOnly }`.
- `expandObligations({ fy, entities, licences, context }): ObligationInput[]` is idempotent by `(rule_id, entity_id, period_label)`.
- `transitionObligation({ obligationId, to, reason }): Obligation` validates the state machine and writes exactly one audit row in the same transaction.
- `buildReminderInstances(obligation): ReminderInput[]` creates T-30/T-10/T-3/due/overdue and special offsets.

- [x] **Step 1: Write failing exact-date tests**

```ts
import { expect, test } from "vitest";
import { calculateBasDueDates } from "@/lib/domain/obligations/calculator";

test.each([
  ["Q1", "2026-10-28", "2026-11-11"],
  ["Q2", "2027-02-28", "2027-03-01"],
  ["Q3", "2027-04-28", "2027-05-12"],
  ["Q4", "2027-07-28", "2027-08-11"],
])("calculates FY2026-27 %s without applying the Q2 extension", (quarter, statutory, effective) => {
  expect(calculateBasDueDates("2026-27", quarter as "Q1"|"Q2"|"Q3"|"Q4")).toEqual({
    incomeYear: "FY2026-27",
    deadlineFy: "FY2026-27",
    statutoryDue: statutory,
    effectiveDue: effective,
  });
});
```

Also test that a company with an outstanding prior-year return gets `incomeYear = FY2025-26`, statutory due `2026-10-31`, effective due `2026-11-02`, and `deadlineFy = FY2026-27`; a current company gets `incomeYear = FY2025-26`, statutory due `2027-02-28`, effective due `2027-03-01`, and `deadlineFy = FY2026-27`. Trust and personal returns due 2026-10-31 use the same FY2025-26/FY2026-27 split. Test ASIC, trust resolution, licence six-week window, super contribution and notice reminders.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/unit/obligation-calculator.test.ts tests/unit/obligation-state.test.ts`

Expected: FAIL because calculator, expansion, and state transition services do not exist.

- [x] **Step 3: Implement explicit quarter rules rather than one generic offset**

Represent Q1/Q3/Q4 online self-lodge offsets as `14` days and Q2 as `0`. Keep the statutory dates explicit for FY2026–27. Apply `nextMelbourneBusinessDay()` only to produce `effectiveDue`. Make expansion idempotent and mark missing configuration as `blocked`.

- [x] **Step 4: Implement state transitions and audit logging**

Allow only `blocked → todo → collecting → draft_ready → lodged → paid`, `na` as a terminal state, and explicit reasoned rollback transitions. Every update must insert `audit_log` with target, from state, to state, reason and Melbourne-local changed timestamp in one transaction.

- [x] **Step 5: Run all Gate 1 unit tests**

Run: `npm test -- tests/unit/melbourne-dates.test.ts tests/unit/obligation-calculator.test.ts tests/unit/obligation-state.test.ts`

Expected: PASS; the output must include the Q2 test proving no 14-day extension.

### Task 1.3: Build the six-column dashboard, obligation detail, and calendar export

**Files:**
- Create: `app/page.tsx`
- Create: `app/obligations/[id]/page.tsx`
- Create: `components/dashboard/entity-column.tsx`
- Create: `components/dashboard/obligation-card.tsx`
- Create: `components/dashboard/urgent-banner.tsx`
- Create: `components/obligations/status-filter.tsx`
- Create: `app/api/obligations/route.ts`
- Create: `app/api/calendar/export/route.ts`
- Create: `lib/domain/obligations/ics.ts`
- Create: `tests/unit/ics.test.ts`
- Create: `tests/e2e/gate1-dashboard.spec.ts`

**Interfaces:**
- `GET /api/obligations?fy=2026-27` returns grouped obligations with `statutoryDue` and `effectiveDue`.
- `GET /api/calendar/export?fy=2026-27` returns `text/calendar` with one all-day event per obligation.
- `renderDashboardModel()` returns six fixed entity columns and sorted urgency cards.
- Each card model contains `incomeYear`, `statutoryDue`, `effectiveDue`, and `deadlineFy`; the title uses `incomeYear` plus statutory due, while the countdown uses `effectiveDue`.

- [x] **Step 1: Write the calendar serialization test**

```ts
test("exports a Melbourne all-day event using the effective due date", () => {
  const ics = serializeObligationsToIcs([{
    id: 1, entityName: "Boyun Pty Ltd", periodLabel: "FY2026-27 Q2",
    effectiveDue: "2027-03-01", statutoryDue: "2027-02-28", status: "todo",
  }]);
  expect(ics).toContain("DTSTART;VALUE=DATE:20270301");
  expect(ics).toContain("Boyun Pty Ltd");
  expect(ics).not.toContain("20270228T");
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/unit/ics.test.ts`

Expected: FAIL because the serializer and export route are absent.

- [x] **Step 3: Implement dashboard data and responsive layout**

Render six columns on desktop, urgent banner for overdue/≤7 days, status filter, hide-completed switch, exact date format, and highest-risk licence styling. On a narrow viewport columns become a readable vertical or horizontally scrollable layout without clipping the primary dates. Do not add camera assertions to this E2E test.

- [x] **Step 4: Implement `.ics` route and detail page**

Use `effective_due` for `DTSTART;VALUE=DATE`, include statutory date in `DESCRIPTION`, include portal URL, and escape iCalendar text. The detail page shows static checklist when AI is disabled and the state transition controls.

- [x] **Step 5: Run Gate 1 verification**

Run: `npm test -- tests/unit/melbourne-dates.test.ts tests/unit/obligation-calculator.test.ts tests/unit/obligation-state.test.ts tests/unit/ics.test.ts && npm run build && npm run test:e2e -- tests/e2e/gate1-dashboard.spec.ts`

Use the browser to seed FY2026–27, configure the three company/ASIC/licence dates, reload `/`, and record all 12 BAS dates plus annual/other cards. The report table must include `income_year`, `deadline_fy`, `statutory_due`, and `effective_due`. Assert the annual card titles show `FY2025–26 信托税表 · 截止 31 Oct 2026` and `FY2025–26 公司税表 · 截止 28 Feb 2027`, while their details show the adjusted actual workdays. Compare the statutory/effective pairs to the design table. Verify `/api/calendar/export?fy=2026-27` contains all due-date events.

- [ ] **Step 6: Stop and request Gate 1 acceptance**

Report the exact generated date table and test output. Do not create or modify Gate 2 files until the user explicitly confirms that the Gate 1 dates match the requirements.

### Gate 1 复审修订（用户反馈后）

- [x] 将牌照周年日作为 `statutory_due`，另存窗口开启日；提醒从窗口开启日开始，详情页显示周年日后 21 天自动注销后果。
- [x] 在 `obligation_rules` 增加 `adjustment_direction`，`forward` 为默认；供款、信托决议和牌照使用 `backward`，BAS/税表/ASIC 使用 `forward`。
- [x] 允许配置缺失的 ASIC 义务保留为 `blocked`，`statutory_due`/`effective_due` 为 `NULL`，不生成默认日期；看板对逾期牌照使用最高危险样式。
- [x] 将 `obligation_rules.required_fields` 纳入 schema 与 seed；BAS/公司税表不依赖 ACN/ASIC，只有规则自己声明的缺失字段才会使该义务 `blocked`。
- [x] 修复提醒展开：blocked ASIC 不生成提醒；同一主体的 BAS 仍生成 T-30/T-10/T-3/当天四条提醒，并锁定对应单元测试。

### Gate 1 修复后转入 Gate 2

用户已确认牌照日期、顺延方向和 ASIC 未配置行为修复正确，并授权在修复 blocked 扩散问题后直接开始 Gate 2；Gate 2 报告开头必须先附修正后的看板截图和两组 blocked/提醒测试结果。Gate 2 验收修订完成并本地合并后，按用户授权进入 Gate 3。
- [x] 补充牌照窗口、2029-06-30 反向调整、ASIC 空配置、规则种子值、提醒锚点和 ICS 日期测试，并重新运行浏览器证据。

## Gate 2 — 四种录入、账本、分类队列与 CSV 导入

Start only after Gate 1 acceptance. Gate 2 must include the email endpoint that was missing from the original implementation plan. Stop after desktop/narrow-screen verification; explicitly leave real phone-camera verification to the user.

### Task 2.1: Add transactions, documents, accounts, and integer-money services

**Files:**
- Modify: `lib/money.ts`
- Create: `lib/ingest/transactions.ts`
- Create: `lib/ingest/documents.ts`
- Create: `lib/ingest/accounts.ts`
- Create: `app/api/transactions/route.ts`
- Create: `app/api/documents/route.ts`
- Create: `tests/unit/transactions.test.ts`

**Interfaces:**
- `createTransaction(input): Transaction` requires entity, date, description, account, GST code and integer `amountCents`.
- `createDocument(input): Document` deduplicates by SHA-256 and stores files only below `data/files/`.
- `listInboxItems(): Promise<InboxItem[]>` returns unconfirmed documents and `review_flag` transactions.

- [x] **Step 1: Write failing integer-money and validation tests**

```ts
test("rejects a transaction amount that is not a safe integer", () => {
  expect(() => createTransaction({ amountCents: 10.5, gstCents: 0 })).toThrow(/integer cents/);
});

test("does not include an unconfirmed transaction in a BAS candidate list", async () => {
  const tx = await createTransaction({ reviewFlag: true, entityId: "boyun_co", gstCode: "GST_INCOME" });
  expect(await listTransactionsEligibleForBas("boyun_co", "2026-27", "Q1")).not.toContainEqual(tx);
});
```

- [x] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- tests/unit/transactions.test.ts`

Expected: FAIL because transaction/document services do not exist.

- [x] **Step 3: Implement transaction/document CRUD with strict integer checks**

Use Zod schemas that distinguish money strings at API boundaries from integer cents inside the domain. Store negative expenses as negative `amount_cents` and negative `gst_cents`; all BAS aggregation converts eligible expense totals to positive absolute values at the boundary. Store `fy` and `quarter` as derived date-only fields.

- [x] **Step 4: Add file hash deduplication and safe paths**

Compute SHA-256 from file bytes, reject path traversal and unsupported MIME types, generate server-side filenames, and never use user-supplied filenames as filesystem paths. A duplicate document is returned with a duplicate status and is not written twice.

- [x] **Step 5: Run tests and a real transaction API request**

Run: `npm test -- tests/unit/transactions.test.ts && npm run build`

Use `POST /api/transactions` and `GET /api/transactions` in the running app, reload the page, and confirm integer amount persistence.

### Task 2.2: Implement photo/file upload and email forwarding

**Files:**
- Create: `lib/ingest/upload.ts`
- Create: `lib/ingest/email.ts`
- Create: `app/upload/page.tsx`
- Create: `app/api/ingest/email/route.ts`
- Modify: `app/api/documents/route.ts`
- Create: `components/ledger/upload-dropzone.tsx`
- Create: `tests/unit/email-ingest.test.ts`
- Create: `tests/e2e/gate2-upload.spec.ts`

**Interfaces:**
- `ingestEmail({ contentType, body, token }): Promise<Document[]>` accepts multipart file parts or JSON `{ attachments: [{ filename, mime, base64 }] }`.
- `POST /api/ingest/email` returns `401` for a missing/invalid `INGEST_TOKEN`, `201` for accepted attachments, and `400` for malformed base64 or unsupported files.
- `POST /api/documents` accepts multiple files and returns document IDs plus `pending`/`duplicate` status.

- [x] **Step 1: Write failing authentication and base64 tests**

```ts
test("rejects email ingestion without the shared token before writing", async () => {
  const response = await requestEmail({ token: "wrong", attachments: [pdfAttachment()] });
  expect(response.status).toBe(401);
  expect(await countDocuments()).toBe(0);
});

test("accepts a base64 PDF with the configured shared token", async () => {
  const response = await requestEmail({ token: "test-ingest-token", attachments: [pdfAttachment()] });
  expect(response.status).toBe(201);
  expect((await response.json()).documents).toHaveLength(1);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/email-ingest.test.ts`

Expected: FAIL because `/api/ingest/email` does not exist.

- [x] **Step 3: Implement constant-time token verification and multipart/base64 parsing**

Read `process.env.INGEST_TOKEN` only on the server. Compare encoded token bytes with a length-safe timing-safe comparison. Do not log request headers, token values, base64 payloads, or attachment contents. Reject requests before any file write if the token is invalid.

- [x] **Step 4: Implement multi-file upload and image compression**

Accept image/PDF files, compress images before storage using `sharp`, store SHA-256-based generated names below `data/files/`, and enqueue documents as `pending`. If AI is disabled, leave `extraction_json` null and show the document in Inbox for manual classification.

- [x] **Step 5: Run unit tests and browser layout verification**

Run: `npm test -- tests/unit/email-ingest.test.ts && npm run test:e2e -- tests/e2e/gate2-upload.spec.ts`

The E2E test must run the upload page at desktop and a narrow viewport, assert no horizontal overflow and visible upload controls, and use a test file chooser. It must not claim real phone camera support.

### Task 2.3: Implement CSV mapping/import and duplicate marking

**Files:**
- Create: `lib/ingest/csv.ts`
- Create: `app/import/page.tsx`
- Create: `app/api/import/csv/route.ts`
- Create: `components/ledger/csv-mapping-wizard.tsx`
- Create: `tests/unit/csv-import.test.ts`
- Create: `tests/e2e/gate2-csv.spec.ts`

**Interfaces:**
- `parseCsvPreview(file): CsvPreview` returns headers and typed sample rows without writing.
- `saveCsvMappingTemplate(input): CsvMappingTemplate` persists bank column mapping.
- `importCsv(input): ImportSummary` creates transactions and marks duplicate candidates.

- [x] **Step 1: Write failing CSV tests**

```ts
test("maps a bank row to date, description and integer cents", () => {
  const result = importCsv({ bankId: "bank-a", mapping: { date: "Date", description: "Narration", amount: "Amount" }, rows: [
    { Date: "01/07/2026", Narration: "Commission", Amount: "1234.50" },
  ]});
  expect(result.created[0].amountCents).toBe(123450);
});

test("marks duplicate date and amount rows instead of dropping them", () => {
  const result = importCsv({ existing: [{ date: "2026-07-01", amountCents: 123450 }], rows: [
    { date: "01/07/2026", description: "Duplicate", amount: "1234.50" },
  ]});
  expect(result.duplicates[0].reason).toContain("date + amount");
});
```

- [x] **Step 2: Run the tests to verify failure**

Run: `npm test -- tests/unit/csv-import.test.ts`

Expected: FAIL because the parser/importer is absent.

- [x] **Step 3: Implement preview, mapping template, exact money parsing, and duplicate detection**

Use `csv-parse` only for CSV syntax. Require date, description, and amount mappings before import. Store balance as integer cents when present. Let the mapping wizard select `DD/MM/YYYY` (default), `YYYY-MM-DD`, or `MM/DD/YYYY`; persist the selection in the bank template, show parsed `DD MMM YYYY` dates in the preview, and block imports when parsing fails or the selected format yields an impossible month. Hash the complete original row (including description) for provenance and identify duplicates by SHA-256 + parsed date + amount, marking them visibly.

- [x] **Step 4: Implement the wizard and browser flow**

Create a three-step flow: upload/preview → map columns → choose entity/default account/GST code and import. The summary must show created, duplicate, invalid, and review counts.

- [x] **Step 5: Run tests and the real CSV flow**

Run: `npm test -- tests/unit/csv-import.test.ts && npm run test:e2e -- tests/e2e/gate2-csv.spec.ts`

Upload a fixture CSV, map it, reload Inbox, and verify the imported records persist.

### Task 2.4: Implement rule classification, Inbox, and manual entry

**Files:**
- Create: `lib/rules/classification.ts`
- Create: `lib/ingest/inbox.ts`
- Create: `app/inbox/page.tsx`
- Create: `components/ledger/inbox-row.tsx`
- Create: `components/ledger/quick-entry-form.tsx`
- Create: `app/api/inbox/route.ts`
- Create: `tests/unit/classification.test.ts`
- Create: `tests/e2e/gate2-inbox.spec.ts`

**Interfaces:**
- `classifyTransaction(row, entityContext): ClassificationSuggestion` uses keyword rules when AI is unavailable.
- `confirmInboxItem(input): Transaction` requires entity, account and GST code and clears the review flag.
- `copyPreviousTransaction(id): DraftTransaction` returns editable values without locking or copying the original ID.

- [x] **Step 1: Write failing rule and keyboard tests**

```ts
test("classifies a common commission supplier with a deterministic fallback", () => {
  expect(classifyTransaction({ description: "Realestate commission" }, { entityId: "boyun_co" })).toMatchObject({
    accountCode: "400", gstCode: "GST_INCOME",
  });
});
```

The browser test must confirm arrow-key movement, number-key account selection, Enter confirmation, and a required-field error when entity/account/GST is missing.

- [x] **Step 2: Run the tests to verify failure**

Run: `npm test -- tests/unit/classification.test.ts`

Expected: FAIL because the rules and Inbox are absent.

- [x] **Step 3: Implement keyword fallback and explicit confirmation**

Keep suggestions separate from confirmed transaction values. Confidence below the configured threshold sets `review_flag = true`; no suggestion may enter a BAS candidate set until the user confirms it.

- [x] **Step 4: Implement Inbox and quick entry UI**

Render all unclassified documents and low-confidence transactions in one page. Use stable keyboard focus order, visually show source and confidence, and allow manual correction. Add duplicate warning rather than silent deletion.

- [x] **Step 5: Run Gate 2 verification and stop**

Run: `npm test -- tests/unit/transactions.test.ts tests/unit/email-ingest.test.ts tests/unit/csv-import.test.ts tests/unit/classification.test.ts && npm run build && npm run test:e2e -- tests/e2e/gate2-upload.spec.ts tests/e2e/gate2-csv.spec.ts tests/e2e/gate2-inbox.spec.ts`

Report that desktop flows and narrow-screen layout were checked. State explicitly: “真实手机拍照、摄像头权限和手机系统上传流程未由自动化验证，留待用户现场验收。” Do not start Gate 3 until the user accepts Gate 2.

## Gate 3 — BAS 底稿、锁定、nil BAS 与导出

Start only after Gate 2 acceptance. This Gate contains the mandatory GST-to-BAS unit test before the generator implementation. Implementation and runtime verification are complete; stop here and wait for Gate 3 acceptance.

### Task 3.1: Implement GST mapping and BAS integer aggregation with TDD

**Files:**
- Create: `lib/domain/bas/gst-mapping.ts`
- Create: `lib/domain/bas/calculator.ts`
- Create: `tests/unit/gst-bas-mapping.test.ts`

**Interfaces:**
- `mapTransactionToBas(tx): BasLineContribution` returns integer deltas for `g1Cents`, `a1Cents`, `b1Cents`, `g10Cents`, and `g11Cents`.
- `summarizeBas(transactions, { payg5aCents, payg5bCents }): BasSummary` returns all labels, `gstNetCents = a1Cents - b1Cents`, and `statementTotalCents = gstNetCents + payg5aCents - payg5bCents` only after both manual PAYG values are resolved. `paygInstalmentCents` remains as a nullable compatibility field equal to 5A - 5B; a negative statement total is a refund.

- [x] **Step 1: Write the complete failing GST mapping test matrix**

```ts
test.each([
  ["GST_INCOME", 110000, 10000, { g1Cents: 110000, a1Cents: 10000, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["GST_FREE_INCOME", 110000, 0, { g1Cents: 110000, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["INPUT_TAXED", 90000, 0, { g1Cents: 90000, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["GST_EXPENSE", -55000, -5000, { g1Cents: 0, a1Cents: 0, b1Cents: 5000, g10Cents: 0, g11Cents: 55000 }],
  ["GST_CAPITAL", -220000, -20000, { g1Cents: 0, a1Cents: 0, b1Cents: 20000, g10Cents: 220000, g11Cents: 0 }],
  ["NO_GST", -10000, 0, { g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["PRIVATE", -10000, 0, { g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
])("maps %s without floating amounts", (gstCode, amountCents, gstCents, expected) => {
  expect(mapTransactionToBas({ gstCode, amountCents, gstCents })).toEqual(expected);
});
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/unit/gst-bas-mapping.test.ts`

Expected: FAIL because the GST mapping function is absent.

- [x] **Step 3: Implement the mapping as a total pure function**

Treat expenses as negative in the ledger and use integer absolute values for G11/G10/1B. Reject fractional amounts and unknown GST codes. Exclude `PRIVATE` and `NO_GST` completely. Do not calculate any money with `parseFloat`.

- [x] **Step 4: Add summary, Simpler BAS and PAYG tests**

Test `gstNetCents`, split 5A/5B `statementTotalCents`, negative refund labeling, the unresolved/null PAYG state, explicit no-PAYG zero nil BAS, and that `review_flag = true`, missing account, missing entity or missing GST code yields a warning rather than an included contribution. Assert that G10/G11 remain available in the internal summary but are not part of the external instructions model, and that the G1 instruction selects 「该金额是否含 GST」为「是」。

- [x] **Step 5: Run the mandatory GST unit test**

Run: `npm test -- tests/unit/gst-bas-mapping.test.ts`

Expected: PASS with every row in the matrix.

### Task 3.2: Implement atomic BAS worksheet generation and exports

**Files:**
- Create: `lib/domain/bas/generator.ts`
- Create: `lib/domain/bas/export.ts`
- Create: `app/api/bas/[obligationId]/route.ts`
- Create: `app/bas/[obligationId]/page.tsx`
- Create: `components/bas/bas-summary.tsx`
- Create: `components/bas/bas-instructions.tsx`
- Create: `tests/unit/bas-generator.test.ts`
- Create: `tests/e2e/gate3-bas.spec.ts`

**Interfaces:**
- `generateBasWorksheet(obligationId): { worksheet, warnings, lockedTransactionIds }` runs as one SQLite transaction.
- `exportBasCsv(worksheetId): Response` exports traceable transaction lines.
- `exportBasPdf(worksheetId): Response` exports the one-page worksheet and instructions.
- `updateBasPaygInstalments(obligationId, { payg5aCents, payg5bCents }): BasWorksheet` records the user's integer-cent 5A/5B values and never calculates them; the explicit no-PAYG option sends 0/0.
- `markBasLodged(obligationId, receiptNumber, lodgedAmountCents): Obligation` requires a resolved `statementTotalCents`, compares the submitted amount to it, writes audit log and moves to `lodged`.

- [x] **Step 1: Write the atomicity and traceability tests**

```ts
test("generates a worksheet, snapshots eligible IDs and locks them atomically", async () => {
  const result = await generateBasWorksheet(q1ObligationId);
  expect(result.worksheet.snapshotJson).toContain(String(eligibleTransactionId));
  expect(await getTransaction(eligibleTransactionId)).toMatchObject({ locked: true });
});

test("rolls back worksheet and locks when validation fails", async () => {
  await expect(generateBasWorksheet(obligationWithUnconfirmedRows)).rejects.toThrow(/待确认/);
  expect(await getWorksheetCount()).toBe(0);
  expect(await getUnlockedTransactionIds()).toContain(unconfirmedId);
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/bas-generator.test.ts`

Expected: FAIL because the generator is absent.

- [x] **Step 3: Implement the transaction and worksheet transaction**

Select only the obligation’s entity/FY/quarter, `locked = false`, confirmed rows. Before writing, query and list all pending rows. If pending rows exist, return a structured warning and do not lock or create the worksheet. For an empty eligible set, create a zero worksheet with `nil BAS` instructions.

- [x] **Step 4: Render Simpler BAS operation instructions, PAYG entry and receipt flow**

Show ATO Online services for business → select company → Lodgments → Activity statements → enter G1, 1A and 1B → for G1 select 「该金额是否含 GST」=「是」 → review any manual 5A payable / 5B credit prefill → submit → record receipt. The instruction card must not contain G10 or G11. The worksheet summary may show G10/G11 in a separate section labelled “内部核算用，不填入 ATO 表单”. The user manually enters the ATO prefilled PAYG 5A/5B amounts in integer cents; until both are resolved, `statementTotalCents` and the “已递交金额” comparison are blocked. An explicit “本期无 PAYG 分期” choice writes 5A=0 and 5B=0, including for a nil BAS, and opens the lodgement flow. The UI labels a negative statement total as “退税” and all other resolved totals as “应缴”. The nil path explicitly says to lodge a nil activity statement. The “已递交” action requires receipt number and actual integer amount, then compares against `statementTotalCents` and uses the audited state transition.

- [x] **Step 5: Add CSV/PDF exports and browser verification**

Use the PDF skill’s render-and-verify workflow for the PDF output. The browser test creates Q1 worksheets for three companies, asserts the dormant company is zero/nil, expands line items, verifies each amount is traceable to a transaction ID, asserts the `data-testid="bas-instructions"` region contains G1/1A/1B but not G10/G11, and asserts the internal summary labels G10/G11 include “内部核算用，不填入 ATO 表单”. It also verifies the G1 含 GST instruction, enters separate 5A/5B values, checks the payable total, completes a nil BAS after the explicit no-PAYG choice, and verifies the lodged-amount comparison uses `statementTotalCents`.

- [x] **Step 6: Run Gate 3 verification and stop**

Run: `npm test -- tests/unit/gst-bas-mapping.test.ts tests/unit/bas-generator.test.ts && npm run build && npm run test:e2e -- tests/e2e/gate3-bas.spec.ts`

Report worksheet IDs, nil BAS result, integer totals, snapshot IDs, lock results, PDF render check, and any warning count. Gate 3 verification is complete; wait for Gate 3 acceptance before Gate 4.

## Gate 4 — 已关账期间补录、AI 适配层、缓存、脱敏和资讯模块

Start only after Gate 3 acceptance. The closed-period safety valve is mandatory; AI remains optional and cannot block the local ledger, BAS, or settings flows.

### Task 4.0: Protect lodged BAS periods from silent omissions

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0004_closed-period-transactions.sql`
- Modify: `lib/ingest/transactions.ts`
- Modify: `lib/ingest/inbox.ts`
- Modify: `lib/domain/bas/generator.ts`
- Modify: `app/api/bas/[obligationId]/route.ts`
- Modify: `components/bas/bas-summary.tsx`
- Modify: `components/ledger/inbox-client.tsx`
- Modify: `components/ledger/inbox-row.tsx`
- Create: `tests/unit/closed-period-transactions.test.ts`
- Create: `tests/e2e/gate4-closed-period.spec.ts`

**Interfaces:**
- `createTransaction(input): Transaction` sets `belongsToClosedPeriod`, `closedPeriodWorksheetId`, and a null `closedPeriodResolution` when the date is covered by a lodged/paid BAS worksheet.
- `listInboxItems(): Promise<InboxItem[]>` returns `ClosedPeriodInboxItem` separately from ordinary `TransactionInboxItem` values.
- `generateBasWorksheet(obligationId, decision?): BasGenerationResult` refuses unresolved closed-period transactions and accepts `include_current`, `revision_required`, or `excluded` with a non-empty exclusion reason.

- [x] **Step 1: Write the failing closed-period schema and creation tests**

```ts
test("marks a Q1 transaction entered after Q1 lodgement without changing the Q1 worksheet", () => {
  const q1 = generateAndLodgeQ1();
  const before = getWorksheetAmounts(q1.worksheetId);
  const late = createTransaction({ ...confirmedQ1Input, date: "2026-07-05" });
  expect(late.belongsToClosedPeriod).toBe(true);
  expect(late.closedPeriodWorksheetId).toBe(q1.worksheetId);
  expect(getWorksheetAmounts(q1.worksheetId)).toEqual(before);
});
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/unit/closed-period-transactions.test.ts`

Expected: FAIL because the transaction columns and closed-period lookup do not exist.

- [x] **Step 3: Add the marker columns and centralize the lookup in `createTransaction`**

Add nullable `closed_period_worksheet_id`, integer `belongs_to_closed_period` defaulting to 0, and nullable `closed_period_resolution`. Within the same SQLite transaction as the insert, query `bas_worksheets JOIN obligations` for the same entity, a `bas_quarterly` period containing the new local date, and obligation status `lodged` or `paid`. Store the matched worksheet ID; do not change the existing worksheet or its transactions.

- [x] **Step 4: Add the failing Inbox separation test**

```ts
test("returns a closed-period transaction in its own Inbox queue", async () => {
  const item = (await listInboxItems()).find((candidate) => candidate.kind === "closed_period_transaction");
  expect(item).toMatchObject({ kind: "closed_period_transaction", originalWorksheetId: expect.any(Number) });
  expect((await listInboxItems()).filter((candidate) => candidate.kind === "transaction")).not.toContain(item);
});
```

- [x] **Step 5: Implement the separate Inbox section and BAS decision gate**

Filter ordinary Inbox rows with `belongs_to_closed_period = 0`; render unresolved closed-period rows under a separate `已关账期间补录` heading. Before a later BAS worksheet is created, return the unresolved rows and require one of the three decisions. `include_current` adds those rows to the new snapshot and locks them; `revision_required` and `excluded` leave them out and set `closed_period_resolution`. Exclusion requires a trimmed reason. Write one `audit_log` row per transaction with the original worksheet, target obligation, decision, and reason. Never update the original worksheet.

- [x] **Step 6: Run the regression tests and browser flow**

Run: `npm test -- tests/unit/closed-period-transactions.test.ts tests/unit/bas-generator.test.ts && npm run build && npm run test:e2e -- tests/e2e/gate4-closed-period.spec.ts`

Verify Q1 amounts remain byte-for-byte equal after the late transaction, the Inbox sections are distinct, the no-decision prompt is visible, each decision is audited, and the next worksheet only includes the transaction when `include_current` is selected.

### Task 4.1: Implement AI config, redaction, persistent cache, and four adapters

**Files:**
- Create: `config/ai.json`
- Create: `lib/ai/config.ts`
- Create: `lib/ai/redact.ts`
- Create: `lib/ai/cache.ts`
- Create: `lib/ai/adapter.ts`
- Create: `lib/ai/fallback.ts`
- Create: `tests/unit/ai-adapter.test.ts`

**Interfaces:**
- `extractInvoice(fileRef): Promise<InvoiceExtraction>`.
- `classifyTransaction(row, entityContext): Promise<ClassificationSuggestion>`.
- `summarizeNews(items, profile): Promise<NewsAnalysis[]>`.
- `explainObligation(obligationId): Promise<ObligationExplanation>`.
- `redactSensitiveText(input): string` replaces TFN, bank account numbers, and full street addresses with stable placeholders.
- `getOrCreateAiCache(method, redactedInput, producer): Promise<unknown>` uses `(method, sha256(canonicalRedactedInput))`.

- [x] **Step 1: Write failing redaction/cache/fallback tests**

```ts
test("redacts TFN, bank account and full address before hashing or sending", () => {
  const input = "TFN 123 456 789, BSB 062000 Account 12345678, 10 Example Street, Melbourne VIC 3000";
  const result = redactSensitiveText(input);
  expect(result).not.toContain("123 456 789");
  expect(result).not.toContain("12345678");
  expect(result).toContain("[REDACTED_TFN]");
  expect(result).toContain("[REDACTED_BANK_ACCOUNT]");
  expect(result).toContain("[REDACTED_ADDRESS]");
});

test("AI disabled uses fallback and writes one persistent cache row", async () => {
  const first = await classifyTransaction({ description: "ATO payment" }, { entityId: "boyun_co" });
  const second = await classifyTransaction({ description: "ATO payment" }, { entityId: "boyun_co" });
  expect(second).toEqual(first);
  expect(await countAiCacheRows()).toBe(1);
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/ai-adapter.test.ts`

Expected: FAIL because redaction, cache and adapters are absent.

- [x] **Step 3: Implement canonical redaction and cache**

Canonicalize keys in stable order, redact before hashing, store only the redacted input and JSON output, and use a unique constraint to prevent duplicate concurrent calls. Read the API key only from the configured environment variable. Do not log prompts, payloads, tokens, or raw invoice contents.

- [x] **Step 4: Implement provider call and safe fallback paths**

On `enabled: false`, timeout, non-2xx response, invalid JSON, or schema mismatch, call the deterministic fallback and return a typed result. Never let an adapter exception reach the page without a caller-level fallback.

- [x] **Step 5: Run AI tests with AI disabled**

Run: `npm test -- tests/unit/ai-adapter.test.ts && npm run build`

Expected: PASS with no network required.

### Task 4.2: Implement asynchronous news fetching, pre-screening, and analysis

**Files:**
- Create: `lib/news/sources.ts`
- Create: `lib/news/fetch.ts`
- Create: `lib/news/prescreen.ts`
- Create: `lib/news/analysis.ts`
- Create: `app/news/page.tsx`
- Create: `app/api/news/route.ts`
- Create: `components/news/news-card.tsx`
- Create: `tests/e2e/gate4-ai-disabled.spec.ts`
- Create: `tests/e2e/gate4-closed-period.spec.ts`
- Create: `tests/unit/news.test.ts`

**Interfaces:**
- `refreshNewsInBackground(): Promise<void>` never blocks the first dashboard response.
- `prescreenNewsItem(item): boolean` matches the configured keyword set.
- `dismissNewsItem(id): void` records `dismissed_at`.
- `createTodoFromNewsAnalysis(id, confirmed): NewsTodo` requires an explicit user action and does not mutate `transactions` or `obligations`.

- [x] **Step 1: Write failing prescreen/cache/error-isolation tests**

```ts
test("only keyword-relevant news enters AI analysis", () => {
  expect(prescreenNewsItem({ title: "ATO GST activity statement update", rawText: "..." })).toBe(true);
  expect(prescreenNewsItem({ title: "Unrelated weather alert", rawText: "..." })).toBe(false);
});

test("one failed source does not prevent other sources from being stored", async () => {
  await expect(refreshSource("bad-source")).resolves.toBeUndefined();
  expect(await countNewsItemsFor("ato-small-business")).toBeGreaterThan(0);
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/news.test.ts`

Expected: FAIL because news services are absent.

- [x] **Step 3: Implement seed sources, 24-hour cache, hash deduplication and silent fallback**

Seed ATO small business, ASIC, Consumer Affairs Victoria estate-agent, and Treasury sources. Store title, original URL, publication date, raw text, and content hash. Update `last_error` per source and keep the last successful cache on failures.

- [x] **Step 4: Implement pre-screened AI analysis and user-confirmed todo creation**

Sort `action` items above `watch` and `none`. Display source name, publication date and original URL on every card. A “建成待办” action must call a confirmation route and never directly alter a transaction, amount or existing obligation.

- [x] **Step 5: Implement the page load boundary**

The dashboard reads cached news synchronously and schedules refresh after the response path; network failures must not throw from the page loader. The news page lists dismissed items separately only when requested.

- [x] **Step 6: Run Gate 4 verification and stop**

Run: `npm test -- tests/unit/ai-adapter.test.ts tests/unit/news.test.ts && npm run build && npm run test:e2e -- tests/e2e/gate4-ai-disabled.spec.ts tests/e2e/gate4-closed-period.spec.ts`

Verify AI-disabled behavior, source links, dismissed state, explicit todo creation, dashboard/detail/BAS load without network, and the closed-period decision flow. Stop and request Gate 4 acceptance.

**Gate 4 implementation status:** all planned steps and verification commands are complete. The implementation is committed locally, but Gate 4 remains unaccepted until the user reviews the dedicated evidence directory and report. Gate 5 has not started.

## Gate 5 — 年度模块、Div 7A、养老金、备份还原与最终验收

Start only after Gate 4 acceptance. This is the final Gate and still requires a stop/report before declaring the whole system accepted.

### Task 5.1: Implement annual aggregation and company/trust/personal worksheets

**Files:**
- Create: `lib/domain/annual/company.ts`
- Create: `lib/domain/annual/trust.ts`
- Create: `lib/domain/annual/personal.ts`
- Create: `app/annual/page.tsx`
- Create: `components/annual/company-worksheet.tsx`
- Create: `components/annual/trust-resolution-form.tsx`
- Create: `components/annual/personal-summary.tsx`
- Create: `tests/unit/annual-worksheets.test.ts`

**Interfaces:**
- `buildCompanyTaxWorksheet(entityId, fy): CompanyWorksheet` returns integer income/expense totals, categorized detail, and named manual supplements.
- `buildTrustDistributionDraft(entityId, fy): TrustDistributionDraft` returns a text template and editable beneficiary amounts.
- `buildPersonalTaxSummary(person, fy): PersonalTaxSummary` aggregates trust distributions, dividends/franking credits and concessional contributions.

- [ ] **Step 1: Write failing worksheet tests**

```ts
test("company worksheet reports integer profit and named manual supplements", async () => {
  const worksheet = await buildCompanyTaxWorksheet("boyun_co", "2026-27");
  expect(Number.isSafeInteger(worksheet.netProfitCents)).toBe(true);
  expect(worksheet.manualItems).toEqual(expect.arrayContaining([
    "折旧", "亏损结转", "franking account", "Div 7A 余额",
  ]));
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- tests/unit/annual-worksheets.test.ts`

Expected: FAIL because annual services do not exist.

- [ ] **Step 3: Implement aggregators and text-template generation**

Aggregate only confirmed transactions by FY, preserve transaction IDs for traceability, and keep manual supplements visibly separate from calculated numbers. Trust distribution output is a draft for user signature, not an electronic filing.

- [ ] **Step 4: Implement annual page and exports**

Show company, trust and personal tabs, editable manual data, a distribution decision template, and source transaction links. Do not offer an automatic filing action.

- [ ] **Step 5: Run tests and browser flow**

Run: `npm test -- tests/unit/annual-worksheets.test.ts && npm run build`

Use the browser to open `/annual`, select FY2026–27, and verify a company worksheet and trust draft render.

### Task 5.2: Implement Div 7A calculation and panel with a mandatory unit test

**Files:**
- Create: `lib/domain/div7a/formula.ts`
- Create: `lib/domain/div7a/service.ts`
- Create: `app/div7a/page.tsx`
- Create: `components/annual/div7a-loan-card.tsx`
- Create: `tests/fixtures/div7a/ato-baseline.json` (created only after official calculator access at Gate 5 entry)
- Create: `tests/unit/div7a.test.ts`

**Interfaces:**
- `calculateMinimumYearlyRepaymentCents(input: { principalCents: number; benchmarkRate: string; remainingTermYears: number; loanIncomeYear: string; assessmentIncomeYear: string }): number` returns `0` in the loan origination income year and a safe integer from the ATO formula from the next income year onward.
- `getDiv7aLoanSummary(loanId, fy): Div7aSummary` returns principal, minimum repayment, actual repayments, shortfall and days to 30 June.

- [ ] **Step 1: Gate 5 entry preflight — obtain an official ATO baseline before writing the implementation**

Before writing the formula implementation or declaring this test passing, enter the planned input set into the ATO official Division 7A calculator: principal `$100,000.00`, benchmark rate `5.30%`, remaining term `7` years, with the calculator's required historical income-year/loan-year fields set so the official tool accepts the input. Record the calculator output in `tests/fixtures/div7a/ato-baseline.json` together with the exact input, source URL, and Melbourne-local retrieval date. Do not copy the implementation's computed output into the fixture.

If the official calculator cannot be accessed or does not accept this historical input, do not invent an expected number. Leave the fixture absent/unverified and make the official-output test `test.skip("ATO calculator unavailable; manual verification required")`; the Gate 5 report must list it under “待人工核对” and must not count it as a passing mandatory test.

- [ ] **Step 2: Write the mandatory failing Div 7A formula tests**

```ts
import { expect, test } from "vitest";
import { calculateMinimumYearlyRepaymentCents } from "@/lib/domain/div7a/formula";

const officialBaseline = loadOfficialAtoBaseline();

(officialBaseline ? test : test.skip)("matches the official ATO calculator output in integer cents", () => {
  expect(calculateMinimumYearlyRepaymentCents({
    principalCents: 10_000_000,
    benchmarkRate: "0.053",
    remainingTermYears: 7,
    loanIncomeYear: officialBaseline.loanIncomeYear,
    assessmentIncomeYear: officialBaseline.assessmentIncomeYear,
  })).toBe(officialBaseline.minimumRepaymentCents);
});

test("supports a 25-year secured term and never returns fractional cents", () => {
  const result = calculateMinimumYearlyRepaymentCents({
    principalCents: 10_000_000,
    benchmarkRate: "0.053",
    remainingTermYears: 25,
    loanIncomeYear: "2016-17",
    assessmentIncomeYear: "2017-18",
  });
  expect(Number.isSafeInteger(result)).toBe(true);
  expect(result).toBeGreaterThan(0);
});

test("does not require a minimum repayment in the loan origination income year", () => {
  expect(calculateMinimumYearlyRepaymentCents({
    principalCents: 10_000_000,
    benchmarkRate: "0.053",
    remainingTermYears: 7,
    loanIncomeYear: "2026-27",
    assessmentIncomeYear: "2026-27",
  })).toBe(0);
});
```

The formula implementation is the ATO minimum yearly repayment formula: `P × I / (1 - (1 / (1 + I))^T)`, where `P` is the unpaid balance at the end of the previous income year, `I` is the benchmark rate, and `T` is the remaining term. Use Decimal.js for the rate/power calculation and round only the final dollar result to the nearest cent with half-up rounding. The official-output assertion is the baseline; the formula itself is not allowed to supply its own expected test value. The implementation reference is the [ATO Division 7A calculator and decision tool](https://www.ato.gov.au/calculators-and-tools/division-7a-calculator-and-decision-tool?page=1).

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- tests/unit/div7a.test.ts`

Expected: FAIL because the formula function is absent.

- [ ] **Step 4: Implement the formula and repayment service**

Validate positive safe-integer principal, rate between 0 and 1, and term of 1–25 years. Return zero and do not create a missing-repayment warning when `assessmentIncomeYear === loanIncomeYear`; start the minimum repayment schedule in the next income year. Store repayments as integer cents in JSON. Use the repayment due date 30 June for shortfall/day countdown presentation and keep agreement-signed status visible.

- [ ] **Step 5: Run the mandatory Div 7A test and panel flow**

Run: `npm test -- tests/unit/div7a.test.ts && npm run build`

Open `/div7a`, create a sample loan, and verify minimum repayment, actual repayment, shortfall and agreement status.

### Task 5.3: Implement super panel, backup/restore, and final regression

**Files:**
- Create: `lib/domain/super/service.ts`
- Create: `app/super/page.tsx`
- Create: `components/annual/super-progress.tsx`
- Create: `app/api/backup/route.ts`
- Create: `app/api/restore/route.ts`
- Create: `lib/backup.ts`
- Create: `tests/unit/super.test.ts`
- Create: `tests/unit/backup.test.ts`
- Create: `tests/e2e/final-regression.spec.ts`

**Interfaces:**
- `getSuperProgress(person, fy): { contributedCents, capCents, remainingCents, noticeStatus, carryForwardHint }`.
- `createBackupArchive(): Promise<ReadableStream>` includes a consistent SQLite backup and `data/files/` without secrets.
- `restoreBackupArchive(file): Promise<void>` validates archive paths and schema before replacing local data in a recoverable transaction/temporary directory.

- [ ] **Step 1: Write failing super and backup tests**

```ts
test("shows the FY2026-27 concessional cap in integer cents", async () => {
  expect((await getSuperProgress("self", "2026-27")).capCents).toBe(3_250_000);
});

test("backup manifest excludes env files and includes database/files metadata", async () => {
  const archive = await createBackupArchive();
  expect(archive.manifest).toMatchObject({ includesDatabase: true, includesFiles: true });
  expect(archive.entries).not.toContain(".env.local");
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- tests/unit/super.test.ts tests/unit/backup.test.ts`

Expected: FAIL because super and backup services are absent.

- [ ] **Step 3: Implement super progress and notice workflow**

Track paid contributions, cap, notice submitted date and the manual carry-forward hint when the prior 30 June balance is below $500,000. The UI must show that the notice is a separate task and cannot infer it from the payment alone.

- [ ] **Step 4: Implement safe backup and restore**

Use a temporary archive path, include SQLite data and files, exclude `.env*`, and reject absolute paths or `..` entries on restore. Do not delete the current database until the archive validates and a rollback copy exists.

- [ ] **Step 5: Run final unit, build and browser regression**

Run: `npm test && npm run lint && npm run build && npm run test:e2e -- tests/e2e/final-regression.spec.ts`

The final browser flow must cover settings persistence, Gate 1 due-date display, CSV import, Inbox confirmation, BAS worksheet/lock, news source link, annual worksheet, Div 7A panel, super panel, and backup download. It must not include real external ATO/ASIC submission.

- [ ] **Step 6: Stop and request Gate 5 acceptance**

Report all test/build/browser evidence, all six Gate outcomes, known manual tasks, and the explicit non-goals. Do not claim the system is fully accepted until the user signs off Gate 5.

## Plan self-review

- Gate 0 covers the full schema, six-entity seed, obligation-rule seed, GST constants, Melbourne timezone foundation, settings persistence, environment hygiene and no application dashboard yet.
- Gate 1 covers weekend/public-holiday adjustment, statutory/effective date separation, all FY2026–27 BAS dates, Q2 exception, `income_year`/`deadline_fy` separation, state machine, reminders, six-column dashboard and `.ics`.
- Gate 1 also reports `income_year` and `deadline_fy` for every date-table row and checks annual titles preserve FY2025–26 even when the deadline falls in FY2026–27.
- Gate 2 covers all four entrances, including multipart/base64 email ingestion with `INGEST_TOKEN`, CSV mapping, integer money, duplicate marking, document hash, Inbox and keyboard flow; real phone camera is explicitly excluded from automated claims.
- Gate 3 covers the mandatory GST mapping unit test, Simpler BAS G1/1A/1B-only instructions, internal G10/G11 labels, manual PAYG 5A/5B input, `gstNetCents` versus `statementTotalCents`, warning gate, atomic lock/snapshot, nil BAS, instructions and PDF/CSV export.
- Gate 4 covers `audit_log`/`ai_cache` availability from Gate 0, AI redaction/cache/fallback, four methods, asynchronous news and explicit user confirmation for news-created todos.
- Gate 5 covers company/trust/personal worksheets, an ATO-official-baseline Div 7A test or explicitly skipped manual-check item, the loan-origination-year zero-repayment rule, super contributions/notice, backup/restore and final regression.
- No step uses `TBD`, `TODO`, or a generic “handle edge cases” instruction; each implementation boundary has a file, interface, test, and expected verification command.
- The only external date uncertainty is the 2027 AFL Grand Final Friday, which the official Victorian calendar currently leaves subject to the AFL schedule; the code will not guess it and will carry an annual update note.
