# Gate 9 验证机制审计报告

审计日期：2026-09-01（Australia/Melbourne）
范围：只修复验证隔离、E2E 启动隔离、`/div7a` 390px 页面溢出；不新增业务功能。
证据目录：`docs/evidence/gate9/`。本轮未修改 `docs/evidence/gate0/` 至 `docs/evidence/gate8/`，未创建 `gate-9`。

## 结论先行

Gate 8 的功能性标签 `gate-8` 已存在，指向 `ec6146ee22cd59839f846fc61c26ec6e88fdc5f7`，未移动或重建。

本轮验证机制修复已提交，但不能报告“全套测试通过”：

- Vitest 默认顺序通过 `36/36` 文件、`190/190` 用例；随机 seed `101` 为 `34/36` 文件、`188/190`，seed `202` 为 `33/36` 文件、`187/190`。失败是同一测试文件内的顺序/fixture 依赖，按要求只报告，没有修改断言或补清表绕过。
- Playwright 全套连续两轮结果完全一致，均为 `7 passed / 5 failed / 2 did not run`（14 个 declaration）。因此浏览器回归目前不能视为全绿。
- 干净 clone 的 `lint` 与 `build` 均通过。
- `/div7a` 390px 页面级横向溢出已消除；`/vehicle-fact-checklist` 仍有 `<pre>` 内部横向溢出，按本轮范围只报告、不修复。

## 0. 干净 clone 复现与历史追溯

### 0.1 复现环境

验证不是在当前工作目录执行，而是在以下全新 clone 中执行：

`/var/folders/vn/n8trtj0x74j5ggwrwlx1n6pm0000gn/T/tax-compliance-gate9-clean.wyXzwK/repo`

执行顺序：

```text
git clone <当前仓库> <全新目录>
npm ci
DATABASE_PATH=<clone>/data/app.db npm run db:migrate
DATABASE_PATH=<clone>/data/app.db npm run db:seed
npm test -- --run
npm test -- --run --sequence.shuffle --sequence.seed 101
npm test -- --run --sequence.shuffle --sequence.seed 202
npm run lint
npm run build
```

结果：

| 项目 | 实际结果 |
|---|---:|
| `npm ci` | 成功；npm 报 6 个漏洞（5 moderate、1 high），本轮未运行 `npm audit fix` |
| 默认 Vitest | 36 文件通过，190/190 通过 |
| shuffle seed 101 | 34 文件通过，188/190 通过 |
| shuffle seed 202 | 33 文件通过，187/190 通过 |
| `npm run lint` | 退出码 0 |
| `npm run build` | 退出码 0 |
| 临时数据库清理 | 三轮结束后无 `tax-compliance-vitest-*` 残留 |

### 0.2 `tests/setup.ts` 历史

实际 `git log --follow --reverse` 输出的关键节点如下：

| 提交 | 日期 | 变化 | Gate 归属/含义 |
|---|---|---|---|
| `9bc7e7a` | 2026-08-26 | 只有时区设置 | 初始脚手架 |
| `c79a8c5` | 2026-08-26 | `DATABASE_PATH ??= "./data/test.db"` | Gate 0：引入整个进程共享的固定 test DB |
| `5b95a92` | 2026-08-29 | 改成模块加载时一次 `mkdtemp`，整个进程/该 setup 实例共用一个临时 DB | Gate 5 前的隔离修复尝试；提交信息称“per file”，实现实际上未做到可靠的每文件隔离 |
| `b50cb36` | 2026-09-01 | 在 `beforeAll` 中按测试文件/worker 建临时 DB，并在 `afterAll` 关闭、删除 | 本轮 Gate 9 验证修复 |

结论：没有找到把 `5b95a92` 之后的隔离代码改回固定 `./data/test.db` 的 Gate 6、7 或 8 提交。问题不是 Gate 6/7/8 某次明确回退，而是 `5b95a92` 的“每文件隔离”实现从一开始就不可靠：路径在 setup 模块加载时生成，Vitest 的收集/执行时序会让多个文件共享该进程级路径。`5b95a92` 的提交信息和 diff 没有记录“性能”或“并发”理由，不能据此推断改动动机。

因此：Gate 6/7/8 的业务代码和跨 Gate SQL 结果仍可单独检查，但此前“随机顺序全量通过”的测试证据不能直接继承为可靠证明；本轮随机运行暴露的顺序依赖必须在后续修复后重新确认。

### 0.3 本轮实现的验证基础设施变化

- Vitest 不再设置 `fileParallelism: false`；每个 setup 运行单元在运行时创建唯一临时目录，结束时关闭连接并删除目录。
- Playwright 每个 spec 使用独立端口、独立临时 DB、独立 Next dist 目录和独立 seed；`INGEST_TOKEN`、`AI_ENABLED=false`、`AI_ALLOW_REAL_DATA=false` 在配置中统一注入。
- `gate0-settings.spec.ts` 的设置标题和保存按钮已使用 exact locator。
- `scripts/e2e-server.ts` 的环境变量经过显式校验后再传给子进程；这是干净 clone build 失败的最小类型修复。
- 仅为 `.div7a-amalgamated-group` 和其中贷款卡补 `min-width: 0`，消除 390px 页面级溢出。

## 1. Gate 5 三项证据

### 1.1 养老金上限按所得年度存储

实际 `SELECT * FROM super_caps ORDER BY income_year;` 输出保存在 [`sql-super-caps.txt`](./sql-super-caps.txt)。核心字段如下；金额均为整数分：

| income_year | concessional_cap_cents | non_concessional_cap_cents | retrieved_at |
|---|---:|---:|---|
| 2021-22 | 2,750,000 | 11,000,000 | 2026-08-29 |
| 2022-23 | 2,750,000 | 11,000,000 | 2026-08-29 |
| 2023-24 | 2,750,000 | 11,000,000 | 2026-08-29 |
| 2024-25 | 3,000,000 | 12,000,000 | 2026-08-29 |
| 2025-26 | 3,000,000 | 12,000,000 | 2026-08-29 |
| 2026-27 | 3,250,000 | 13,000,000 | 2026-08-29 |

每行均保存 ATO concessional/non-concessional 来源 URL。养老金页面截图 [`super-backup.png`](./e2e/super-backup.png) 显示 FY2026–27 `$32,500.00` 与 `$130,000.00`。

### 1.2 Div 7A 逐年余额与官方基准

边界演练贷款：2017-05-15 发放、所属年度 FY2016-17、本金 `10,000,000` 分、无担保、7 年、利率 `5.30%`。完整逐年输出在 [`div7a-boundary.json`](./div7a-boundary.json)：

| 所得年度 | 状态 | 期初余额（分） | 利息（分） | 最低还款（分） | 实际还款（分） | 还款前期末（分） | 还款后期末（分） | 剩余年限 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| FY2017-18 | active | 10,000,000 | 530,000 | 1,747,034 | 0 | 10,530,000 | 8,782,966 | 7 |
| FY2018-19 | active | 8,782,966 | 465,497 | 1,747,035 | 0 | 9,248,463 | 7,501,428 | 6 |
| FY2019-20 | active | 7,501,428 | 397,576 | 1,747,034 | 0 | 7,899,004 | 6,151,970 | 5 |
| FY2020-21 | active | 6,151,970 | 326,054 | 1,747,035 | 0 | 6,478,024 | 4,730,989 | 4 |
| FY2021-22 | active | 4,730,989 | 250,742 | 1,747,034 | 0 | 4,981,731 | 3,234,697 | 3 |
| FY2022-23 | active | 3,234,697 | 171,439 | 1,747,034 | 0 | 3,406,136 | 1,659,102 | 2 |
| FY2023-24 | active | 1,659,102 | 87,932 | 1,747,034 | 0 | 1,747,034 | 0 | 1 |
| FY2024-25 | expired | 0 | 0 | 0 | 0 | — | 0 | 0 |

这里的边界序列用“实际还款 0”展示逐年最低还款和逾期/到期边界；同一测试文件另有“每年按最低额还款”用例，断言最后一个还款年度期末为 0。

ATO 官方基准测试读取 fixture，而不是在测试中硬编码或从实现结果反推。测试代码实际为：

```ts
const officialBaseline = JSON.parse(fs.readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/div7a/ato-baseline.json"),
  "utf8",
)) as OfficialBaseline;

// Official ATO Division 7A calculator result from
// https://www.ato.gov.au/calculators-and-tools/division-7a-calculator-and-decision-tool?page=1,
// entered/read on 27 Aug 2026 (Australia/Melbourne), not an expected value
// calculated by this test suite.
test("matches the official ATO calculator output in integer cents", () => {
  expect(officialBaseline.retrievedAt).toBe("2026-08-27");
  expect(calculateMinimumYearlyRepaymentCents({
    principalCents: officialBaseline.principalCents,
    benchmarkRate: officialBaseline.benchmarkRate,
    remainingTermYears: officialBaseline.termYears,
    loanIncomeYear: officialBaseline.loanIncomeYear,
    assessmentIncomeYear: officialBaseline.assessmentIncomeYear,
  })).toBe(officialBaseline.minimumRepaymentCents);
});
```

fixture 在 [`tests/fixtures/div7a/ato-baseline.json`](../../tests/fixtures/div7a/ato-baseline.json)，官方基准为 `1,747,034` 分。

### 1.3 按主体类型生成年度人工补充项

截图 [`annual-worksheets.png`](./e2e/annual-worksheets.png) 同时显示个人、信托和公司：个人只显示个人相关项；信托显示 FTE；公司显示 franking account 与 Div 7A 借款余额。该截图已目视检查，没有把公司/信托字段渲染到个人卡片。

## 2. 约束符合性审计

以下每一条“符合”先给出反证现象，再列出实际观察；不是只以测试绿灯作为依据。

### 2.1 十条核心约束

| 约束 | 结论 | 如果结论是错的，会观察到 | 实际观察与证据 |
|---|---|---|---|
| BAS 12 条日期、Q2 无两周延期 | 符合 | SQL 或 UI 中出现 Q2 `2027-03-14`、12 条缺行或三家公司日期不一致 | [`sql-bas-fy2026-27.txt`](./sql-bas-fy2026-27.txt) 有 12 行：三家公司 Q1 `2026-10-28→2026-11-11`、Q2 `2027-02-28→2027-03-01`、Q3 `2027-04-28→2027-05-12`、Q4 `2027-07-28→2027-08-11`；看板截图也显示 Q2 `01 Mar 2027`。 |
| backward 顺延 | 符合 | 2029-06-30 周六的供款或信托决议被推到 2029-07-02 | [`backward-direction.json`](./backward-direction.json) 是两个目标测试文件的 16/16 通过输出：两者均为 `2029-06-29`。 |
| `blocked` 逐义务判断 | 符合 | 清空一家公司 ASIC 后，该公司的 BAS/公司税表也变 blocked 或日期变空 | [`blocked-scope.json`](./blocked-scope.json) 实际清空 `yeeliving_co` 后，只有 ASIC 行 blocked 且两日期 NULL；4 条 BAS 与公司税表仍为 todo，日期与 Boyun 一致。 |
| 金额为整数分 | 符合（有显示层除外） | 金额计算路径出现 `parseFloat`、用 `/100` 后再参与金额运算或浮点取整 | 全库搜索无 `parseFloat`。全部命中：`components/assets/assets-page-client.tsx:75` 的 `/100).toFixed(2)` 只初始化处置金额显示输入；`lib/money.ts:35` 的 `/100` 只用于 `Intl.NumberFormat` 显示；`tests/unit/div7a-rates.test.ts:43` 的 `parsed.toFixed(4)` 是利率文本断言，不是金额；金额解析使用 `BigInt`。 |
| TFN 不入库 | 符合 | schema 出现 TFN 列、事务写入 TFN 或 AI payload 含原始 TFN | schema 搜索无 TFN 列；`lib/settings.ts` 对 TFN 输入拒绝，`lib/ai/redact.ts` 做 TFN 脱敏；测试验证拒绝和脱敏。实际没有找到业务写入路径。 |
| 不自动向 ATO/ASIC 申报 | 符合 | 出现指向 ATO/ASIC 的提交 POST、付款或 lodgement 客户端 | 外部 URL 搜索只找到门户、法规/来源、资讯抓取和配置的 AI provider；应用内部 `/api/*` 请求不是监管提交端点；未找到 ATO/ASIC submission API。 |
| 所有日期时区/格式约束 | 符合（手机相机流程除外） | 日期按浏览器 locale 变成 `07/15/2026`，或固定 UTC+10 导致夏令时偏差 | 运行环境和代码使用 `Australia/Melbourne`；已生成 UI 采用 `DD MMM YYYY`，输入为 `DD/MM/YYYY`；390px 仅验证布局，不宣称真实手机拍照上传。 |
| AI 输出不直接落库 | 符合 | 资讯/AI 分析结果直接插入 transactions 或 obligations | AI 路径写入分析/缓存或待用户确认动作；没有 AI 到 transactions/obligations 的直接写入调用；Gate 4 的 AI disabled 截图见 [`gate4-ai-disabled-news.png`](./e2e/gate4-ai-disabled-news.png)。 |
| 已递交底稿不被修改 | 符合 | 补录前期交易改变已 lodged/paid worksheet 的金额 | [`annual-reconciliation.json`](./annual-reconciliation.json) 与备份/跨期演练显示前期更正走单独决策；现有锁定行没有自动改数。 |
| 测试基准不是自算值 | 符合 | `1,747,034` 只在测试实现中出现且没有官方来源/日期 | 见 1.2：fixture 保存 ATO URL、2026-08-27 取数日，测试从 fixture 读取。 |

### 2.2 前期 Gate 追加约束

| 约束 | 实际验证 |
|---|---|
| Simpler BAS 只列 G1/1A/1B，G10/G11 内部使用 | 代码测试与 Gate 3 E2E 通过；截图/页面显示 G10/G11 为“内部核算用，不填入 ATO 表单”，操作指引不出现二者。 |
| G1 含 GST 勾选“是” | `tests/unit/bas-instructions.test.ts` 与 Gate 3 E2E 断言指引含该步骤。 |
| PAYG 5A/5B | 实际底稿数据按 `gstNet + 5A - 5B`；负数场景显示退税，BAS 快照在 [`summary.json`](./summary.json)。 |
| 无 PAYG 显式选项 | Gate 3 nil BAS 路径使用“本期无 PAYG 分期”，可走 `draft_ready → lodged → paid`。 |
| 前期更正三处追溯 | Gate 4 单元测试及页面、CSV、PDF 导出断言已存在；本轮 E2E 的旧测试因缺 `lodgedAt` 未跑到该路径，不能把这次 E2E 失败写成通过。 |
| CSV 日期格式与完整去重键 | `csv-import.test.ts` 覆盖三格式、解析预览和完整原始行 hash（含描述）；本轮完整 E2E 的 CSV spec 有旧科目 fixture 问题，见 2.3。 |
| 资讯过滤与未知日期 | `news.test.ts` 覆盖 90 天、关键词、无雇员排除和 `published_at=NULL`；真实 AI-disabled 页面截图见 [`gate4-ai-disabled-news.png`](./e2e/gate4-ai-disabled-news.png)。 |

### 2.3 随机 Vitest 暴露的未修复失败

这些不是通过调整顺序或删表修复的；它们是本轮必须保留的发现：

1. `tests/unit/seed.test.ts`：seed 101/202 中出现 `no such table: obligation_rules`。同文件第二个测试在同文件第一个 `seedDatabase()` 之前运行，说明测试用例仍依赖同文件执行顺序。
2. `tests/unit/div7a-agreement.test.ts`：seed 101/202 中未知 `security_type` 测试在隔离 DB 中使用不存在的 `agreementDocumentId: 1`，触发真实外键错误。它依赖其他测试留下的 document 行或缺失独立 fixture。
3. `tests/unit/gate8-obligations-and-trust.test.ts`：seed 202 中 FY2027–28 未配置假日测试看到 `effectiveDue=2028-02-28`，因为同一文件另一个测试先配置了 2028 假日；seed 101 中相反地 Q1 也因同文件状态顺序得到 NULL。该测试仍有同文件状态依赖。

严重程度：高（会削弱后续 Gate 的回归证明力）；本轮不改测试断言、不调整固定顺序、不在 `beforeEach` 清表掩盖。

## 3. 端到端年度演练与跨模块交叉

### 3.1 两个财年与幂等展开

独立证据 DB 为 `/var/folders/vn/n8trtj0x74j5ggwrwlx1n6pm0000gn/T/tax-compliance-gate9-final-audit.cxZetk/audit.db`，包含六个主体：`self`、`spouse`、`boyun_trust`、`boyun_co`、`yeeliving_co`、`neighbourhood_co`。

| 范围 | 义务数 |
|---|---:|
| FY2026–27 | 30 |
| FY2027–28 | 30 |
| FY2026–27 BAS | 12 |
| FY2027–28 BAS | 12 |
| 同一财年重复生成第二次 | 数量保持 30，不重复 |

FY2027–28 Q2 的实际 SQL/API 值为 `statutory_due=2028-02-28`、`effective_due=NULL`，因为 2028 假日年未配置；没有推定 2028 假日。Q1 在已有配置范围内为 `2027-10-28→2027-11-11`。完整结果见 [`rollover-two-fy.json`](./rollover-two-fy.json) 和 [`sql-obligations-two-fy.txt`](./sql-obligations-two-fy.txt)。

### 3.2 FY2026–27 BAS 四季表

下表来自实际四份 worksheet SQL，金额为分；三家公司均已生成并标记 paid：

| 主体 | Q1 G1/1A | Q2 G1/1A | Q3 G1/1A | Q4 G1/1A |
|---|---:|---:|---:|---:|
| Boyun | 185,000 / 10,000 | 370,000 / 20,000 | 555,000 / 30,000 | 740,000 / 40,000 |
| Yeeliving | 370,000 / 20,000 | 740,000 / 40,000 | 1,110,000 / 60,000 | 1,480,000 / 80,000 |
| Neighbourhood（nil） | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

原始逐行输出见 [`sql-bas-fy2026-27.txt`](./sql-bas-fy2026-27.txt)。

### 3.3 GST 不含税年度对账

年度收入按不含 GST 口径；`NOT_A_SUPPLY` 不进入 BAS G1，也不进入年度收入。对账不是阻断式不变式，而是逐 GST code 列出差额供用户确认。

| 公司 | BAS G1 合计（分） | BAS 1A 合计（分） | G1−1A（分） | 年度收入（分） | 差额（分） |
|---|---:|---:|---:|---:|---:|
| Boyun | 1,850,000 | 100,000 | 1,750,000 | 1,750,000 | 0 |
| Yeeliving | 3,700,000 | 200,000 | 3,500,000 | 3,500,000 | 0 |
| Neighbourhood | 0 | 0 | 0 | 0 | 0 |

Boyun 和 Yeeliving 的 `GST_INCOME`、`GST_FREE_INCOME`、`INPUT_TAXED`、`NOT_A_SUPPLY` 分组逐笔构成也都为 0 差额；详见 [`annual-reconciliation.json`](./annual-reconciliation.json)。年度页面见 [`annual-cross-check.png`](./annual-cross-check.png)。

用于核对年度来源数据的实际 SQL 聚合输出为：

```text
entity_id          annual_income_ex_gst  operating_expense_ex_gst  capital_purchase_ex_gst
boyun_co            1750000              -250000                   1000000
boyun_trust          300000               -50000                         0
yeeliving_co        3500000              -500000                   2000000
```

三处交叉：UI 为 `annual-cross-check.png`；API 原始响应为 [`api-http-annual-fy2026-27.json`](./api-http-annual-fy2026-27.json)（明确 `amountBasis=GST-exclusive`）；SQL 对账与交易聚合为 [`sql-annual-reconciliation.txt`](./sql-annual-reconciliation.txt)，逐 code 的应用层结果在 [`annual-reconciliation.json`](./annual-reconciliation.json)。

### 3.4 信托分配、资产、Div 7A

| 检查 | UI | API | SQL/实际结果 |
|---|---|---|---|
| 信托分配 | [`annual-cross-check.png`](./annual-cross-check.png)：self/spouse 各 `$1,250.00`，信托合计 `$2,500.00` | [`api-cross-check-summary.json`](./api-cross-check-summary.json)：两个人各 `125000` 分 | [`sql-trust-distributions.txt`](./sql-trust-distributions.txt)：两行各 `125000`，合计与可分配收入 `250000` 差额 0；[`trust-distribution-cross-check.json`](./trust-distribution-cross-check.json) 同值 |
| 资产折旧 | [`annual-cross-check.png`](./annual-cross-check.png)：总折旧/可抵扣额按资产显示 | [`api-cross-check-summary.json`](./api-cross-check-summary.json)：Boyun `200000`、Yeeliving `800000`、Neighbourhood `100000` 分 | [`assets-cross-check.json`](./assets-cross-check.json)：三家公司账面减少额分别相等，差额均 0；原始资产在 [`sql-assets.txt`](./sql-assets.txt) |
| Div 7A 利息与余额 | [`div7a-cross-check.png`](./div7a-cross-check.png)：8.77%、期初余额、利息、还款、期末余额 | [`api-http-div7a-fy2026-27.json`](./api-http-div7a-fy2026-27.json)：Boyun loan 1 期初 `900000`、利息 `78930`、期末 `978930` | [`div7a-cross-check.json`](./div7a-cross-check.json)：`900000 + 78930 - 0 = 978930`，差额 0；`900000 × 8.77% = 78930` |

### 3.5 备份还原

实际导出 ZIP → 清空临时库 → 还原 → 比较七组表。结果见 [`backup-roundtrip.json`](./backup-roundtrip.json) 和 [`backup-diff.txt`](./backup-diff.txt)：

```text
entities          6  -> 6
transactions     59  -> 59
obligations      60  -> 60
bas_worksheets   12  -> 12
div7a_loans       4  -> 4
assets             3  -> 3
opening_balances   2  -> 2
diff exit code: 0
files equal: true
```

## 4. Playwright 全套结果

配置为 9 个 spec project、14 个 test declaration、默认并行。两个完整运行都显示 `Running 14 tests using 6 workers`，并且结果集合和失败原因一致：

| spec/位置 | 现象 | 判断 |
|---|---|---|
| `tests/e2e/gate1-dashboard.spec.ts:5` | 期望 `实际工作日：02 Nov 2026` 3 个，实际 5 个；同一页面有个人、信托和 super 的日期文本 | 旧数量断言/选择器假设，需另行修复；本轮不改断言 |
| `tests/e2e/gate2-csv.spec.ts:16–20` | CSV 导入后 Inbox 找不到描述；spec 按 index 选择科目，未保证进入 review Inbox | 旧 fixture/科目选择假设；不是隔离问题 |
| `tests/e2e/gate2-inbox.spec.ts:14–22` | 选择 Boyun 的第一个 account 后发送 `GST_EXPENSE`，API 返回 400 | 测试选了 bank/asset account，和 API 合约不匹配 |
| `tests/e2e/gate3-bas.spec.ts:12–17` | 选择公司第一个 account 后发送 `GST_INCOME`，API 返回 400 | 测试选了 bank/asset account，和 API 合约不匹配 |
| `tests/e2e/gate4-closed-period.spec.ts:29–30` | lodge 请求省略用户填写的 `lodgedAt`，API 返回非 2xx | 当前 API 要求用户提供提交日期；旧 spec 未跟随日期输入契约 |

通过的 7 个 declaration 包含 Gate 0 settings、Gate 2 upload、AI disabled 和 final regression 的部分路径；由于 serial spec 在首个失败后停止，另外 2 个 declaration 标记为 did not run。两轮均为 `7/5/2`，但“稳定失败”不等于“通过”。

## 5. 390px 响应式检查

逐页检查了 `/`、`/inbox`、`/import`、`/upload`、`/settings`、`/news`、`/annual`、`/div7a`、`/assets`、`/super`、`/vehicle-fact-checklist`、`/obligations/7`、`/bas/9`。

- `/div7a` 修复后 viewport、body 和 document scroll width 均为 390；贷款表格自身保留可横向滚动的内部容器，这是预期行为。截图 [`div7a-390.png`](./div7a-390.png) 已目视检查。
- 其余页面在本次检查中页面级 width 均为 390，无 body 横向溢出。
- `/vehicle-fact-checklist` 在 390px 下仍有 `scrollWidth=3670`，原因是 Markdown `<pre>` 内容不换行。按任务范围只修 `/div7a`，该项列入发现，不在本轮修复。
- 真实手机拍照、摄像头权限和移动端上传流程无法由本环境验证，未作通过声明。

## 6. 自审

### 6.1 反证法表

| 结论 | 反证观察 | 已执行观察 | 结果 |
|---|---|---|---|
| 每文件数据库已隔离 | 不同文件插入一条唯一数据后，另一文件能读到该行，或测试后临时 DB 残留 | 默认并行运行 36 个文件；三轮结束检查临时目录；跨文件污染不再表现为固定共享路径，残留为 0 | 隔离层符合；同文件内部依赖仍暴露并已列为发现 |
| BAS Q2 未错误加两周 | UI/API/SQL 出现 `2027-03-14` | SQL 12 行、raw HTTP 和 dashboard 都核对到 `2027-03-01` | 未观察到反证现象 |
| 2028 未配置时不猜假日 | 未配置 2028 仍生成具体 `effective_due` | 独立 DB 中 Q2 为 `statutory_due=2028-02-28`、`effective_due=NULL`，配置后的行为另有单元测试 | 未观察到反证现象 |
| `NOT_A_SUPPLY` 被排除 | 该代码出现在年度收入或 BAS G1 | 三家公司代码分组及年度对账显示该组两边均为 0 | 未观察到反证现象 |
| 信托端和个人端一致 | 三处金额不同或一个人没有 125000 分 | UI、API、SQL 都为 self/spouse 各 125000 分、信托合计 250000 分 | 未观察到反证现象 |
| 备份还原无差额 | 七组表 count 或文件内容不同 | before/after 输出相同，diff exit code 0、files equal true | 未观察到反证现象 |
| E2E 套件可靠通过 | 14 declaration 全部 pass | 实际两轮均 7 pass、5 fail、2 did not run | 反证成立：不能宣称 E2E 全通过 |

### 6.2 UI/API/SQL 三处交叉

本轮对金额和日期结论分别从三处取数：

- BAS 日期：看板 [`dashboard-cross-check.png`](./dashboard-cross-check.png)、raw HTTP [`api-http-obligations-fy2026-27.json`](./api-http-obligations-fy2026-27.json)、SQL [`sql-bas-fy2026-27.txt`](./sql-bas-fy2026-27.txt)。
- 年度收入：年度页面 [`annual-cross-check.png`](./annual-cross-check.png)、raw HTTP [`api-http-annual-fy2026-27.json`](./api-http-annual-fy2026-27.json)、SQL 聚合和 [`annual-reconciliation.json`](./annual-reconciliation.json)。
- 信托分配：年度页面、API [`api-cross-check-summary.json`](./api-cross-check-summary.json)、SQL [`sql-trust-distributions.txt`](./sql-trust-distributions.txt)。
- Div 7A：贷款页面 [`div7a-cross-check.png`](./div7a-cross-check.png)、API [`api-http-div7a-fy2026-27.json`](./api-http-div7a-fy2026-27.json)、SQL/计算交叉 [`div7a-cross-check.json`](./div7a-cross-check.json)。
- 资产：年度页面、API summary、SQL [`sql-asset-depreciation-cross-check.txt`](./sql-asset-depreciation-cross-check.txt) 与 [`assets-cross-check.json`](./assets-cross-check.json)。
- 备份：页面控制流、ZIP manifest/文件、before/after SQL 和 diff [`backup-diff.txt`](./backup-diff.txt)。

### 6.3 截图目视检查

已逐张打开并检查本目录生成的 10 张 PNG：

`dashboard-cross-check.png`、`annual-cross-check.png`、`div7a-cross-check.png`、`div7a-390.png`、`e2e/annual-worksheets.png`、`e2e/div7a-official-baseline.png`、`e2e/gate2-upload-desktop.png`、`e2e/gate2-upload-narrow.png`、`e2e/gate4-ai-disabled-news.png`、`e2e/super-backup.png`。

目视结果与报告描述一致；`div7a-390.png` 的表格是卡片内部滚动，不是页面整体溢出；年度截图的主体类型字段没有错放到个人卡片。

### 6.4 主动暴露的三个最没把握点及针对性验证

1. **测试隔离是否真的独立**：最没把握的是 Vitest setup 与 worker/collection 的交互。用三轮真实全量运行验证；结果默认全通过但两个 shuffle 暴露三个同文件依赖，故没有把“全量通过”写入结论。
2. **Playwright 是否只是单 spec 假绿**：最没把握的是旧 spec 是否依赖共享数据库。启用每 spec 独立 DB、并行运行全套两次；两轮稳定出现同一 5 个失败，证明它们不是跨 spec 污染造成的假绿，而是旧断言/fixture/API 契约问题，保留为发现。
3. **财年滚动后未配置假日是否会被猜测**：在独立证据 DB 连续展开两个财年并重复展开 FY2027–28；Q2 的 `effective_due` 保持 NULL，statutory date 保留，重复展开不增加行。这个关键危险路径通过 SQL/API/UI 交叉验证。

## 7. 发现清单（只报告，不修复）

| ID | 现象/位置 | 影响 | 严重程度 |
|---|---|---|---|
| F-G9-01 | `tests/unit/seed.test.ts` 同文件测试顺序依赖 `seedDatabase()`；shuffle 时出现 `no such table` | 随机顺序不能作为可靠回归证明，后续 Gate 的测试证据会被污染 | 高 |
| F-G9-02 | `tests/unit/div7a-agreement.test.ts` 使用不存在的 `agreementDocumentId:1`；独立 DB 触发 FK 错误 | Div 7A 协议合规测试没有独立可重复 fixture | 高 |
| F-G9-03 | `tests/unit/gate8-obligations-and-trust.test.ts` 共享同文件假日配置状态；不同 seed 得到相反结果 | FY2027–28 未配置假日的结论会受用例顺序影响 | 高 |
| F-G9-04 | `gate1-dashboard.spec.ts:5` 日期文本数量期望 3、实际 5 | E2E 首个失败阻断同 spec 后续 declaration | 中 |
| F-G9-05 | `gate2-csv.spec.ts:16–20` 按 account index 选择科目，导入后 Inbox 无对应行 | CSV 浏览器路径未能在全套 E2E 中完成 | 中 |
| F-G9-06 | `gate2-inbox.spec.ts:14–22` 用 bank/asset account 发送 GST_EXPENSE，API 400 | Inbox 浏览器路径未能在全套 E2E 中完成；测试 fixture 不符合 API 约束 | 中 |
| F-G9-07 | `gate3-bas.spec.ts:12–17` 用 bank/asset account 发送 GST_INCOME，API 400 | BAS 浏览器路径未能在全套 E2E 中完成；测试 fixture 不符合 API 约束 | 中 |
| F-G9-08 | `gate4-closed-period.spec.ts:29–30` lodge 未传用户填写的 `lodgedAt` | 前期更正 E2E 未能完成；不能用这次 E2E 证明流程全通 | 中 |
| F-G9-09 | `/vehicle-fact-checklist` 390px 的 Markdown `<pre>` 横向溢出 | 窄屏阅读该页面需要横向滚动；本轮只获授权修 `/div7a` | 中 |

### 7.1 未能验证项（非空）

- Playwright 14 个 declaration 全通过：未验证，实际为两轮 `7/5/2`。
- 同文件顺序依赖完全消除：未验证，shuffle 仍有 3 个失败；需后续修复后再跑。
- `/vehicle-fact-checklist` 390px 无溢出：未验证，已观察到反证现象且本轮不修。
- 真实手机相机拍照、摄像头权限和上传流程：环境无法验证。
- 2028 年维州公众假日配置后的所有 `effective_due`：官方日历尚未配置，本轮只验证“未配置时必须 NULL”，未验证未来假日录入后的全部日期。
- 真实 ATO/ASIC 提交流程：系统明确禁止自动申报，本轮没有也不应执行真实提交。
- 五个 E2E 失败究竟哪些需要产品改动、哪些只需更新测试 fixture：已定位现象，但需用户决定是否接受修复测试契约，不能在本轮擅自修改。

## 8. 本轮提交与标签状态

本轮提交：

- `b50cb36` — `test: isolate gate9 verification runs`
- `055dd79` — `test: route cross-gate audit evidence`
- `89ef8c8` — `fix: narrow isolated e2e server configuration`

`HANDOVER.md` 已更新第 6 节为本轮真实基线，并保留/补充 Gate 9 发现、范围和标签状态。当前不创建 `gate-9`；`gate-8` 保持原 hash 不变。
