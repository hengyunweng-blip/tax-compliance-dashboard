# Gate 9 Verification Infrastructure Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Vitest and Playwright regression suites independently reproducible and remove the confirmed `/div7a` narrow-viewport overflow without changing tax-domain behavior.

**Architecture:** Vitest will select a unique temporary SQLite path at runtime for each collected test file, close the database before switching files, and remove the file after the file completes. Playwright will run each spec against its own seeded Next server, database, and build directory so parallel specs cannot share application state. The only product UI change is responsive CSS for `/div7a`; all other narrow-screen findings remain report-only.

**Tech Stack:** Vitest 3.2.7, Playwright 1.55, Next.js 15, TypeScript, better-sqlite3, Drizzle migrations, npm scripts.

**Spec:** User Gate 9 verification-infrastructure instructions in the conversation; prior evidence remains under `docs/evidence/gate0/` through `docs/evidence/gate8/` and is read-only.

## Global Constraints

- Do not add tax-domain functionality.
- Do not modify existing test assertions or expected literals.
- Do not serialize tests or rely on fixed order or table-clearing to hide state leakage.
- Every Vitest test file and every Playwright spec receives an independent database and seed.
- `INGEST_TOKEN` is injected by the Playwright test configuration/server, not by manual shell setup.
- Only `/div7a` overflow is fixed; overflow on other pages is reported.
- Do not modify existing Gate 0–8 evidence files or tags; create no `gate-9` tag.
- Write all new evidence to `docs/evidence/gate9/`.

---

### Task 1: Confirm root causes and preserve the baseline

**Files:**
- Read: `tests/setup.ts`, `vitest.config.ts`, `playwright.config.ts`, `tests/e2e/*.spec.ts`
- Read: history of `tests/setup.ts`
- Evidence: `docs/evidence/gate9/` only

**Interfaces:**
- Consumes: current repository state and the prior Gate 8 report.
- Produces: a recorded history conclusion, reproducible pre-fix failure output, and a list of test/spec files that write old Gate evidence paths.

- [ ] **Step 1: Reproduce the current failure without changing the repository**

Run:

```bash
npm test -- --run --sequence.shuffle --sequence.seed 123
git log --follow --date=iso --format='%h %ad %s' -- tests/setup.ts
```

Record the actual failing test and show that `5b95a92` creates one temporary database during collection, while no later commit changed `tests/setup.ts`.

- [ ] **Step 2: Inventory hard-coded evidence writes**

Run:

```bash
rg -n 'docs/evidence/gate[0-9]|output/' tests/e2e scripts
```

Use this inventory to redirect only new Gate 9 verification screenshots/output; do not overwrite old evidence.

---

### Task 2: Make Vitest database isolation file-scoped

**Files:**
- Modify: `tests/setup.ts`
- Test: existing `tests/unit/gate8-obligations-and-trust.test.ts` shuffle regression and full Vitest suite

**Interfaces:**
- Consumes: `getRawDb()` lazy database initialization and the Vitest setup-file lifecycle.
- Produces: one `DATABASE_PATH` per test file, selected in a runtime hook after Vitest sets the current file, with close-and-delete cleanup.

- [ ] **Step 1: Use the existing shuffle failure as the red test**

Run:

```bash
npm test -- --run --sequence.shuffle --sequence.seed 123
```

Expected: the existing suite reproduces a cross-file state failure, such as the FY2027–28 holiday expectation receiving a persisted `effectiveDue`.

- [ ] **Step 2: Implement the smallest setup-only change**

Keep the existing temporary-directory creation and cleanup, but set `process.env.DATABASE_PATH` from the current file’s setup hook at runtime before the file’s database-using hooks run. Close the previous singleton before switching paths. Do not alter `lib/`, test assertions, `fileParallelism`, or ordering.

- [ ] **Step 3: Verify the targeted regression**

Run:

```bash
npm test -- --run tests/unit/gate8-obligations-and-trust.test.ts --sequence.shuffle --sequence.seed 123
```

Expected: all five tests pass and the test process removes its temporary database directory.

- [ ] **Step 4: Verify the complete Vitest suite three ways**

Run:

```bash
npm test -- --run
npm test -- --run --sequence.shuffle --sequence.seed 101
npm test -- --run --sequence.shuffle --sequence.seed 202
```

Record files, tests, passes, failures, and any newly exposed failure without changing a failing expectation.

---

### Task 3: Isolate every Playwright spec

**Files:**
- Modify: `playwright.config.ts`
- Create: `scripts/e2e-server.ts`
- Modify: `package.json`
- Modify: `next.config.ts`
- Modify: `.gitignore`
- Modify: `tests/e2e/*.spec.ts` only to route screenshots/PDF evidence to `docs/evidence/gate9/`

**Interfaces:**
- Consumes: Playwright projects, root `webServer` array, `DATABASE_PATH`, `INGEST_TOKEN`, Next dev server, Drizzle seed functions.
- Produces: one named Playwright project and one seeded server/database per spec file, with unique ports and build directories and a stable per-run `baseURL`.

- [ ] **Step 1: Create the per-spec server runner**

Implement `scripts/e2e-server.ts` so it validates the supplied `DATABASE_PATH`, runs migrations and seed after the environment is set, then starts Next on the supplied port. The server process inherits `INGEST_TOKEN=test-ingest-token` from Playwright and uses a unique `NEXT_DIST_DIR`.

- [ ] **Step 2: Configure one project and web server per spec**

Build the project/server list from the nine files in `tests/e2e/`. Each project uses its server’s `baseURL`; each server has a unique temporary database path, port, and Next build directory. Leave test declarations within a spec free to share that spec’s seeded database when the spec explicitly uses serial state.

- [ ] **Step 3: Fix the exact locator collision**

Change the settings E2E locator to identify the exact settings control required by the test, preserving its assertion and behavior. Verify it no longer matches multiple controls under strict mode.

- [ ] **Step 4: Redirect new browser evidence**

Change screenshot/PDF output paths used by the E2E suite to `docs/evidence/gate9/e2e/` so a full run cannot mutate `docs/evidence/gate0/` through `docs/evidence/gate8/`.

- [ ] **Step 5: Run the full suite twice in default parallel mode**

Run:

```bash
npm run test:e2e
npm run test:e2e
```

Expected: 14 declarations run in both runs; record pass/fail counts. If a failure is a product defect, leave it as a finding instead of weakening the test.

---

### Task 4: Fix only `/div7a` narrow-screen overflow

**Files:**
- Modify: `app/globals.css`
- Read/verify: all page routes used by `tests/e2e/*.spec.ts`
- Test: existing narrow viewport assertions plus an evidence-only 390px route sweep

**Interfaces:**
- Consumes: current Div 7A schedule/table layout and existing responsive breakpoints.
- Produces: no document-level horizontal overflow at 390px on `/div7a`, while preserving readable access to the wide schedule content.

- [ ] **Step 1: Reproduce and isolate the overflowing element**

Run the `/div7a` 390px check and inspect `document.documentElement.scrollWidth`, the page bounding boxes, and the schedule/table wrapper. Record the element causing overflow.

- [ ] **Step 2: Add a failing assertion if the existing one does not cover the exact route**

Use the existing Playwright narrow-route assertion; do not change its expected value. If a targeted test is needed, add a new assertion that expects `scrollWidth <= innerWidth` for `/div7a`.

- [ ] **Step 3: Apply the minimal CSS fix**

Constrain the Div 7A page/card/form/grid at the narrow breakpoint and keep the schedule table inside its intentional scroll wrapper. Do not alter other routes’ layout rules.

- [ ] **Step 4: Verify all implemented routes at 390px**

Run a route sweep over `/`, `/settings`, `/annual`, `/div7a`, `/assets`, `/super`, `/inbox`, `/import`, `/upload`, `/news`, and `/vehicle-fact-checklist`. Record every route with overflow; only `/div7a` may be changed in this task.

---

### Task 5: Revalidate Gate 5–8 key claims and write the Gate 9 report

**Files:**
- Create: `docs/evidence/gate9/report.md`
- Create: `docs/evidence/gate9/` SQL/API/UI outputs and screenshots
- Modify: `HANDOVER.md` only if the actual baseline or known verification status changed

**Interfaces:**
- Consumes: clean-clone test/E2E/lint/build outputs and existing database/domain scripts.
- Produces: auditable Gate 9 evidence, including the history conclusion, three Vitest runs, two Playwright runs, route sweep, cross-gate key assertions, and non-empty unverified-items section.

- [ ] **Step 1: Run clean-clone verification**

In a new clone, run `npm ci`, `npm run db:migrate`, `npm run db:seed`, the three Vitest commands, `npm run lint`, `npm run build`, and the full Playwright suite. Keep all clone databases outside the repository.

- [ ] **Step 2: Re-run the six key assertions with UI/API/SQL evidence**

Verify FY2026–27 BAS dates, FY2027–28 unconfigured-holiday behavior, Div 7A boundary, three-company annual reconciliation, trust allocations, and seven-table backup diff. Record the three views for every money/date conclusion.

- [ ] **Step 3: Inspect screenshots visually**

Open every new screenshot, record that it contains the claimed content without blank, clipped, or misaligned elements, and do not claim visual verification from file existence alone.

- [ ] **Step 4: Write the report and stop before `gate-9`**

Include the reverse-proof table, three-way cross-check table, three self-identified weak points with targeted checks, and a non-empty `未能验证项` section. Do not create a `gate-9` tag.

---

## Self-Review

- Spec coverage: Tasks 1–2 cover history and Vitest isolation; Task 3 covers spec isolation, env injection, strict locator, and evidence safety; Task 4 covers `/div7a` and report-only route findings; Task 5 covers clean-clone, cross-gate, visual, and self-audit evidence.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step is used; commands and target files are explicit.
- Type consistency: `scripts/e2e-server.ts` is invoked by the package script and receives the same `DATABASE_PATH`, `NEXT_DIST_DIR`, `PORT`, and `INGEST_TOKEN` values created by `playwright.config.ts`.
