# Gate 5 前全面审计报告

状态：**阶段 0–5 已完成；等待本次审计验收。**  
审计日期：2026-08-29（Australia/Melbourne）  
审计对象：从本仓库 `main` 新建的干净 clone，commit `30c51201eb2abf769436fe33d62157e6df8467d3`  
临时 clone：`/tmp/tax-compliance-pre-gate5-audit-UXykEq/clone`

## 阶段 0 · 干净克隆复现

### 执行方式

没有在当前工作目录运行阶段 0。实际执行：

```text
git clone --no-local /Users/neilweng/Documents/ChatGPT/税务任务开发 /tmp/tax-compliance-pre-gate5-audit-UXykEq/clone
npm ci
npm run db:migrate
npm run db:seed
npm test -- --run
```

clone 初始状态为干净的 `main`，HEAD 为 `30c51201eb2abf769436fe33d62157e6df8467d3`，标签仅为 `gate-0` 至 `gate-4`。`npm ci`、migration、seed 均返回退出码 0。`npm ci` 报告依赖树有 8 个漏洞（5 moderate、3 high），本轮只记录，不修复。

### 结果

预期基线：29 个单元测试文件 / 143 个用例全部通过。  
实际结果：29 个单元测试文件，28 个文件通过、1 个文件失败；142/143 用例通过、1 个失败。

失败项：

```text
FAIL tests/unit/seed.test.ts > seed creates six entities and three GST-registered companies without obligations
AssertionError: expected { count: 26 } to deeply equal { count: 0 }
tests/unit/seed.test.ts:25:81
```

该测试的断言是：

```ts
expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM obligations").get()).toEqual({ count: 0 });
```

实际运行时查询结果为 `{ count: 26 }`。随后使用全新、独立的 `DATABASE_PATH=./data/isolated-seed-test.db` 单独运行 `tests/unit/seed.test.ts`，结果为 2/2 通过。这说明失败不是实体或 seed 规则数量断言本身失败，而是全量测试运行期间共享 `./data/test.db` 状态：其他测试扩展出的 26 条 obligations 被 seed 测试读到，测试未做到数据库隔离或清理。

### 按指令停止

由于全量测试实际数字不符合用户指定的 29/143 基线，本审计在阶段 0 停止，没有自行修正测试、seed 或数据库隔离，也没有继续运行阶段 0 后续的 `npm run lint` / `npm run build`，没有进入阶段 1–5。没有创建 `gate-5` 标签，也没有修改 `docs/evidence/gate0` 至 `docs/evidence/gate5` 下任何文件。

## 任务 A · 测试隔离修复

只修改了 `tests/setup.ts`，提交为 `5b95a92c0b5e60485f021d809d33a23b3c8e9215`。没有修改 `lib/`、任何测试断言或期望值。

- 每个 test file 的 setup 创建 `fs.mkdtempSync(...)` 临时目录，并将 `DATABASE_PATH` 强制指向该目录内的 `test.db`。
- setup 注册 `afterAll`，先调用 SQLite 单例的 `closeDatabase()`，再递归删除该临时目录及其 WAL/SHM 文件。
- 修复后的当前工作树全量测试首先恢复为 29/143 全部通过；之后又在下方全新 clone 中复现。

## 任务 B · 修复后的真实基线

在修复 commit `5b95a92c0b5e60485f021d809d33a23b3c8e9215` 后重新从 `main` 建立全新 clone：
`/tmp/tax-compliance-pre-gate5-baseline-hLzFON/clone`。

| 检查 | 实际结果 |
|---|---|
| `npm ci` | 退出码 0；报告 8 个漏洞（5 moderate、3 high） |
| `npm run db:migrate` + `npm run db:seed` | 退出码 0 |
| 第一次 `npm test -- --run` | 29 个文件通过，143/143 通过 |
| 第二次 `npm test -- --run --sequence.shuffle` | 29 个文件通过，143/143 通过；Vitest seed `1787959171081` |
| `npm run lint` | 退出码 0 |
| `npm run build` | 退出码 0；Next.js 15.5.24 production compile/typecheck 通过 |

两次全量结果一致，没有再出现跨文件数据库残留。`npm audit fix` 未执行。

### 依赖漏洞（只审计，不修复）

`npm audit --omit=dev --json` 仍报告 high=3，三个 high 包及依赖归属如下：

| 包 | 版本/路径 | 归属 | 主要问题 |
|---|---|---|---|
| `drizzle-orm` | 0.44.7，直接列在 `dependencies` | 运行时依赖 | SQL identifier escaping 相关 SQL injection advisory |
| `postcss` | 8.4.31，位于 `next@15.5.24` 的嵌套依赖路径 | 运行时路径（Next）；项目同时也直接声明了开发期 `postcss@8.5.26` | source map 路径读取 / 信息泄露相关 high advisories |
| `sharp` | 0.34.5，直接列在 `dependencies`，也被 Next 使用 | 运行时依赖 | libvips 继承的 CVE advisories |

因此这 3 个 high 都会出现在省略 dev dependencies 的审计结果中；不是仅存在于测试工具的开发依赖问题。具体 advisory URL、版本范围和可用升级版本保留在该次 `npm audit --json` 输出中；本轮不执行升级。

## 任务 C · `tests/setup.ts` 历史

`git log --follow -- tests/setup.ts` 的实际历史：

```text
9bc7e7a 2026-08-26 chore: scaffold local tax compliance app
c79a8c5 2026-08-26 feat: complete gate 0 foundation and settings
5b95a92 2026-08-29 test: isolate vitest databases per file
```

- `9bc7e7a` 首次创建文件，只设置 `TZ`，发生在 Gate 0 之前的脚手架阶段。
- `c79a8c5` 增加 `process.env.DATABASE_PATH ??= "./data/test.db"`；该 commit 是 `gate-0` 标签的祖先。因此共享 `./data/test.db` 从 Gate 0 开始存在，并持续到本次 `5b95a92` 修复。
- 这意味着 Gate 0–4 期间依赖全量 Vitest “全部通过”的测试结论需要重新看待；本审计不把那些旧的共享数据库通过记录当作独立可靠证据。当前干净 clone 的两次隔离后基线才是新的测试基线。

## 阶段 1 · Gate 5 三项修复证据

阶段 1 使用独立证据数据库：`/tmp/tax-compliance-pre-gate5-baseline-hLzFON/clone/data/pre-gate5-audit-stage1.db`。阶段 1 的截图只写入本目录：`super-cap.png`、`annual-types.png`。

### 1.1 养老金上限按所得年度存储

在该数据库执行：

```text
DATABASE_PATH=./data/pre-gate5-audit-stage1.db npm run db:migrate
DATABASE_PATH=./data/pre-gate5-audit-stage1.db npm run db:seed
SELECT * FROM super_caps ORDER BY income_year;
```

实际 SQL 结果（省略 SQLite 自动生成的 `created_at`/`updated_at` 后，其他列逐列保留）：

```text
income_year | concessional_cap_cents | non_concessional_cap_cents | concessional_source_url | concessional_retrieved_at | non_concessional_source_url | non_concessional_retrieved_at
2021-22     | 2750000                | 11000000                   | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap | 2026-08-29 | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap | 2026-08-29
2022-23     | 2750000                | 11000000                   | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap | 2026-08-29 | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap | 2026-08-29
2023-24     | 2750000                | 11000000                   | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap | 2026-08-29 | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap | 2026-08-29
2024-25     | 3000000                | 12000000                   | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap | 2026-08-29 | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap | 2026-08-29
2025-26     | 3000000                | 12000000                   | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap | 2026-08-29 | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap | 2026-08-29
2026-27     | 3250000                | 13000000                   | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap | 2026-08-29 | https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap | 2026-08-29
```

养老金页面实际浏览器输出包含：`使用者本人 · FY2026–27`、`年度上限 $32,500.00`、`非应税上限 $130,000.00`，并显示两个来源的取数日期 `2026-08-29`。截图：[super-cap.png](./super-cap.png)。

### 1.2 Div 7A 逐年重算

独立数据库创建的贷款：贷款日 `15 May 2017`、本金 `10,000,000` 分、手动基准利率 `5.30%`、原始期限 7 年。服务层连续五个所得年度以及期限后的实际输出：

```text
loan_id | income_year | minimum_repayment_cents | remaining_term_years | balance_at_previous_year_end_cents | repayment_status | repayment_due
1       | FY2016-17   | 0                       | 7                    | 10000000                           | origination      | 2017-06-30
1       | FY2017-18   | 1747034                 | 7                    | 10000000                           | active           | 2018-06-30
1       | FY2018-19   | 1989117                 | 6                    | 10000000                           | active           | 2019-06-30
1       | FY2019-20   | 2328936                 | 5                    | 10000000                           | active           | 2020-06-30
1       | FY2020-21   | 2839797                 | 4                    | 10000000                           | active           | 2021-06-30
1       | FY2023-24   | 10530000                | 1                    | 10000000                           | active           | 2024-06-30
1       | FY2024-25   | 0                       | 0                    | 10000000                           | expired          | NULL
```

因此发放年度为 0，随后四个连续年度均不相等，FY2024–25 进入 `expired`。官方基准仍来自 fixture，不是实现结果回写。测试中读取 fixture 的实际代码为：

```ts
const officialBaseline = JSON.parse(fs.readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/div7a/ato-baseline.json"),
  "utf8",
)) as OfficialBaseline;

test("matches the official ATO calculator output in integer cents", () => {
  expect(officialBaseline.sourceUrl).toContain("ato.gov.au/calculators-and-tools/division-7a-calculator");
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

fixture 中的官方输出为 `$17,470.34` / `1,747,034` 分，来源 URL 为 ATO Division 7A calculator，取数日期 `2026-08-27`；测试注释明确标明不是自算期望值。

### 1.3 按主体类型生成年度人工补充清单

年度底稿页面实际检查结果：

```text
个人（使用者本人）：折旧、结转亏损；不含 franking account 余额、Div 7A 借款余额、信托 FTE 状态
信托（Boyun Trust）：折旧、结转亏损、信托 FTE 状态
公司（Boyun Pty Ltd）：折旧、结转亏损、franking account 余额、Div 7A 借款余额
```

截图：[annual-types.png](./annual-types.png)。截图显示个人、信托及三家公司卡片，且上述三类清单均可见。

阶段 1 已完成，继续进入阶段 2。

## 阶段 0 / 任务 A 当时发现

| 严重程度 | 现象 | 影响 | 位置 |
|---|---|---|---|
| 高（阻塞审计） | 全量 Vitest 使用共享 `./data/test.db`；`seed.test.ts` 期望 obligations 为 0，但全量运行时读到 26 条 | 29/143 基线无法在干净 clone 复现；测试结果可能受文件级执行顺序和跨测试状态污染影响 | `tests/setup.ts:2`、`tests/unit/seed.test.ts:5-25`；相关扩展逻辑在各测试共享数据库上运行 |
| 中 | `npm ci` 报告 8 个依赖漏洞（5 moderate、3 high） | 依赖安全状态需要后续单独评估；本轮未运行 `npm audit fix` | clean clone 的 `npm ci` 输出 |

## 阶段 0 当时未能验证项（后续已补做）

由于阶段 0 的强制停止，以下项目本轮没有验证：

- `npm run lint` 和 `npm run build` 在干净 clone 的结果。
- 阶段 1 的年度养老金上限、Div 7A 五年序列和主体类型清单运行证据。
- 阶段 2 的 BAS 日期、顺延方向、blocked 隔离、金额、TFN、网络请求及前期 Gate 约束审计。
- 阶段 3 的四季度 BAS、前期更正、阈值拒绝、年度收入交叉核对以及备份还原。
- 阶段 4 的 `HANDOVER.md` 补充约束和对应测试文件名。
- 阶段 5 的反证法、UI/API/SQL 三处交叉、截图目视检查和三处最没把握点验证。

上述项目已在后续阶段逐项补做；本节保留阶段 0 强制停止时的原始记录。最终未能验证项见报告末尾；`gate-5` 标签仍未创建。

## 阶段 2 · 约束符合性审计

本阶段继续使用修复后 clean clone `/tmp/tax-compliance-pre-gate5-baseline-hLzFON/clone`，并在独立数据库 `data/pre-gate5-audit-stage2.db` 上执行真实数据操作。以下结论不是只根据测试通过得出；每项均附 SQL、运行时服务输出或代码路径证据。

### 2.1 BAS 日期、所属年度与 `deadline_fy`

执行的查询：

```sql
SELECT entity_id, period_label, statutory_due, effective_due
FROM obligations
WHERE rule_id = 'bas_quarterly'
ORDER BY entity_id, period_label;
```

实际输出：

```text
boyun_co         FY2026-27 Q1  2026-10-28  2026-11-11
boyun_co         FY2026-27 Q2  2027-02-28  2027-03-01
boyun_co         FY2026-27 Q3  2027-04-28  2027-05-12
boyun_co         FY2026-27 Q4  2027-07-28  2027-08-11
neighbourhood_co FY2026-27 Q1  2026-10-28  2026-11-11
neighbourhood_co FY2026-27 Q2  2027-02-28  2027-03-01
neighbourhood_co FY2026-27 Q3  2027-04-28  2027-05-12
neighbourhood_co FY2026-27 Q4  2027-07-28  2027-08-11
yeeliving_co    FY2026-27 Q1  2026-10-28  2026-11-11
yeeliving_co    FY2026-27 Q2  2027-02-28  2027-03-01
yeeliving_co    FY2026-27 Q3  2027-04-28  2027-05-12
yeeliving_co    FY2026-27 Q4  2027-07-28  2027-08-11
```

Q2 实际日为 `01 Mar 2027`，没有套用两周延期。规则生成代码将 `income_year` 与 `deadline_fy` 分开写入；年度税表在该库中显示为 `income_year = FY2025-26`、截止财年为 `FY2026-27`。

### 2.2 顺延方向

对 `2029-06-30`（运行时按 `Australia/Melbourne` 判定为 Saturday）调用两个实际计算服务，输出如下：

```text
superContribution: statutoryDue=2029-06-30, effectiveDue=2029-06-29
trustDistribution: statutoryDue=2029-06-30, effectiveDue=2029-06-29
```

规则表实际声明为：BAS/税表/ASIC `forward`，个人可抵扣供款、信托分配决议 `backward`；牌照年度声明也为 `backward`。

### 2.3 `blocked` 逐义务判断

清空 `yeeliving_co` 的 `acn` 与 `asic_review_date`，重新展开义务后的实际 SQL 输出：

```text
yeeliving_co asic_annual_review  FY2026-27     blocked  NULL        NULL
yeeliving_co bas_quarterly       FY2026-27 Q1  todo     2026-10-28  2026-11-11
yeeliving_co bas_quarterly       FY2026-27 Q2  todo     2027-02-28  2027-03-01
yeeliving_co bas_quarterly       FY2026-27 Q3  todo     2027-04-28  2027-05-12
yeeliving_co bas_quarterly       FY2026-27 Q4  todo     2027-07-28  2027-08-11
yeeliving_co company_tax_return  FY2025-26     todo     2027-02-28  2027-03-01
```

BAS 与公司税表的 `required_fields` 均为空；ASIC 规则的 `required_fields` 为 [`"asic_review_date"`]。缺少 ACN 本身没有把 BAS 或公司税表置为 `blocked`。

### 2.4 金额整数分审计

对仓库（排除 `node_modules` 与证据文本）执行 `rg`：

```text
parseFloat: 0 hits
toFixed:    0 hits
金额相关 /100: lib/money.ts:35: Intl.NumberFormat(...).format(cents / 100)
```

`lib/money.ts:35` 是唯一金额 `/100`，只在 `formatCents` 的显示层将整数分格式化为澳元；没有把显示值回写或用于业务计算。另一个看似百分比的除法位于 `lib/domain/div7a/service.ts:193`，是手动输入的基准利率百分号归一化为利率参数，非金额运算；贷款本金与还款仍通过 `assertIntegerCents` 和整数算术处理。金额 schema 使用 SQLite `integer`，交易、BAS、年度汇总及导出均保留 cents 字段。

### 2.5 TFN 不入库与 AI payload

实际调用 AI adapter（provider 使用测试 stub，不是生产服务）并查询 schema/API 的输出：

```json
{
  "capturedPayload": {
    "method": "classifyTransaction",
    "input": {
      "row": {"description": "Invoice TFN [REDACTED_TFN], [REDACTED_BANK_ACCOUNT]", "address": "[REDACTED_ADDRESS]"},
      "entityContext": {"entityId": "boyun_co", "taxFileNumber": "[REDACTED_TFN]", "bankAccount": "[REDACTED_BANK_ACCOUNT]", "address": "[REDACTED_ADDRESS]"}
    }
  },
  "cacheRedactedInput": "... [REDACTED_TFN] ... [REDACTED_BANK_ACCOUNT] ... [REDACTED_ADDRESS] ...",
  "tfnPatchStatus": 400,
  "entityColumns": ["id","name","type","abn","acn","gst_registered","incorporation_date","asic_review_date","bas_cycle","active","sort_order","created_at","updated_at"]
}
```

原始 TFN、银行账号和地址没有出现在实际 provider body 或 `ai_cache.redacted_input_json`；`PATCH /api/settings` 带 `tfn` 被 strict schema 拒绝，`entities` 表也没有 `tfn` 列。

### 2.6 无自动申报的网络出口枚举

代码库中服务器端的外部网络调用只有两类：

```text
lib/ai/adapter.ts:67  fetch(config.endpoint, { method: "POST" })
  -> AI provider，仅用于 AI 适配器。
lib/news/fetch.ts:323  fetch(source.url, { ... })
  -> ATO/ASIC/CAV/Treasury 配置的资讯列表 GET。
lib/news/fetch.ts:328  fetch(ATO Coveo search URL, { method: "POST" })
  -> ATO 资讯搜索，不是申报端点。
```

其余 `fetch` 是浏览器到本应用 `/api/...` 的内部请求；`portalUrl` 只是卡片链接。未发现向 ATO 或 ASIC 的 lodgement/submission endpoint 发起 POST/PUT/PATCH/DELETE 的代码，因此无自动申报路径。

### 2.7 其他已定约束的运行核验

#### Simpler BAS 与 G1 含 GST

真实服务输出的指引数组为：

```text
["登录 ATO Online services for business",
 "选择公司 → Lodgments → Activity statements",
 "在活动申报表填写 G1、1A、1B",
 "填写 G1 后，对“该金额是否含 GST”选择“是”",
 "核对 ATO 预填的 5A/5B PAYG instalment",
 "提交后记录 ATO 回执号"]
```

指引没有 G10/G11；底稿 UI 的 G10/G11 位于“内部核算”区并写明“内部核算用，不填入 ATO 表单”。

#### PAYG 5A/5B 与退税

用一笔 GST expense 真实调用 `summarizeBas`，输出为：

```text
gstNetCents=-5000, payg5aCents=0, payg5bCents=1000,
paygInstalmentCents=-1000, statementTotalCents=-6000, statementType=refund
```

即 `statementTotalCents = gstNetCents + 5A - 5B`，负数被标记为 `refund`，并未把金额限制为正数。

#### “本期无 PAYG 分期”与 nil BAS

在同一独立库对 Boyun Q1 实际执行生成 nil 底稿、写入 `5A=0/5B=0`、用 `0` 校验已递交金额，再执行状态转换。输出为：

```text
isNil=true; payg5aCents=0; payg5bCents=0; statementTotalCents=0;
lodged.status=lodged; lodged.amountCents=0; paid.status=paid
```

#### 前期更正页面、CSV、PDF 与阈值

实际生成 Q2 前期更正底稿的交易行带 `isPriorPeriodCorrection=true`、原属 `FY2026-27 Q1`、原 worksheet `#1`。CSV 汇总行实际为：

```text
CORRECTION_SUMMARY,,"本期含 1 笔前期更正，合计 $1,100.00，原属期间 FY2026–27 Q1",...,
```

PDF 文本实际包含：

```text
Prior-period corrections: 1 transaction(s), total $1,100.00, originally FY2026-27 Q1
Prior-period correction | Transaction #1 | 05 Jul 2026 | FY2026-27 Q1 | worksheet #1 | GST_INCOME | $1,100.00
```

另一笔 GST 更正 `1,250,000` 分（$12,500）尝试 `include_current` 时实际被拒绝，Q3 worksheet 数量保持 `0`，交易仍为 `locked=0, closed_period_resolution=NULL`。

#### CSV 日期格式、预览与去重键

同一原始字符串 `03/04/2026` 的真实解析输出：

```text
DD/MM/YYYY -> 2026-04-03 -> FY2025-26 Q4
MM/DD/YYYY -> 2026-03-04 -> FY2025-26 Q3
```

模板实际写入 SQL 的 `mapping_json` 包含 `"dateFormat":"MM/DD/YYYY"`。三行同日同额测试中，描述 `Merchant A` 与 `Merchant B` 各创建一行，第二个完全相同的 `Merchant A` 才进入 duplicate；去重键是 `SHA-256(完整原始行) + 解析日期 + 金额分`，完整行 hash 包含描述。

#### 资讯窗口、关键词排除与未知日期

在真实 ATO、ASIC、CAV 来源运行一次抓取（Treasury 保留但 `active=0`）后的 SQL/服务结果：

```text
ATO: 100 items, 38 published_at=NULL, last_error=NULL
ASIC: 4 items, 0 published_at=NULL, last_error=NULL
CAV: 10 items, 0 published_at=NULL, last_error=NULL
Treasury: inactive, not fetched
主列表: 9 条；可能不适用: 12 条；日期未知: 38 条
```

主列表实际命中词逐条为：

```text
Superannuation and whole-of-business retirement -> superannuation
Melbourne’s inner north targeted in winter auction compliance checks -> estate agents, underquoting
Estate agency and representatives accused of rampant underquoting -> estate agents, estate agency, underquoting
Estate agency facing court and VCAT over alleged rental failures -> estate agents, estate agency, vcat
Agencies fined following Renting Taskforce investigation -> estate agents, estate agencies, renting taskforce
Stronger action on over-claimed expenses and GST credits -> gst
Essendon agent convicted for mishandling client money -> estate agent, estate agents
Have your say on the future of GST -> gst
Estate agent Mark Reuben sentenced for unlicensed trading -> estate agent, estate agents
```

默认窗口以 `published_at >= 2026-05-31` 过滤，主列表未包含日期未知条目；无雇员排除区实际命中 `payday super`、`fuel tax credit(s)`、`sbsch`、`payroll`/`stp` 等并单独展示，未进入主列表。资讯页面显示每条主列表的命中关键词；单源错误只更新该来源 `last_error`。

### 阶段 2 发现

| 严重程度 | 现象 | 影响 | 位置 |
|---|---|---|---|
| 中 | 状态机将义务转为 `paid` 时只更新 `status` 和审计记录，没有写入 `paid_at`；nil BAS 真实流程 SQL 返回 `status=paid` 但 `paid_at=NULL` | 依赖付款日期的报表、审计检索或后续提醒无法区分“已缴款但无日期”；状态本身仍为 `paid` | `lib/domain/obligations/state-machine.ts:44-58` |

阶段 2 完成，继续阶段 3。上述发现只记录，不在本轮修复。

## 阶段 3 · 端到端年度演练

### 3.1 独立证据库与交易覆盖

年度演练使用独立数据库：
`/tmp/tax-compliance-pre-gate5-baseline-hLzFON/clone/data/pre-gate5-audit-stage3.db`。
该库从空文件执行 `npm run db:migrate`、`npm run db:seed` 后，再设置 Boyun 的 ACN/ASIC 周年日并展开 FY2026–27 义务。没有使用阶段 1/2 的数据库。

为 Boyun Pty Ltd 创建了 25 笔交易，覆盖 FY2026–27 四个季度；每季包含 3 笔收入和 3 笔支出，收入/支出类型覆盖 `GST_INCOME`、`GST_FREE_INCOME`、`INPUT_TAXED`、`GST_EXPENSE`、`GST_CAPITAL`、`NO_GST`。Q3 已递交后再录入 1 笔日期为 `25 Sep 2026` 的 Q1 交易（$1,100，GST $100），它被标为 Q1 原 worksheet `#1` 的前期更正，并在 Q4 选择 `include_current`。

### 3.2 Q1 → Q4 BAS 流程

按顺序生成底稿，录入 5A/5B，使用 `statementTotalCents` 做已递交金额校验，再完成 `draft_ready → lodged → paid`。实际数据库结果如下（金额全部为分）：

```text
period | status | statutory_due | effective_due | G1 | 1A | 1B | G10 | G11 | 5A | 5B | statement_total
Q1     | paid   | 2026-10-28    | 2026-11-11    | 190000 | 10000 | 25000 | 220000 | 55000  | 2500 |    0 | -12500
Q2     | paid   | 2027-02-28    | 2027-03-01    | 320000 | 20000 | 32500 | 275000 | 80000  | 3000 |  500 | -10000
Q3     | paid   | 2027-04-28    | 2027-05-12    | 450000 | 30000 | 40000 | 330000 | 105000 |    0 |    0 | -10000
Q4     | paid   | 2027-07-28    | 2027-08-11    | 690000 | 50000 | 47500 | 385000 | 130000 | 5000 | 1000 |   6500
```

Q4 页面截图：[stage3-q4-correction.png](./stage3-q4-correction.png)。页面显示前期更正汇总、交易日期 `25 Sep 2026`、原属 Q1、原 worksheet `#1`、G10/G11 内部核算标识、5A/5B 以及应缴 `$65.00`。年度看板截图：[stage3-dashboard.png](./stage3-dashboard.png)。

### 3.3 超过更正阈值的分支

另用独立数据库
`/tmp/tax-compliance-pre-gate5-baseline-hLzFON/clone/data/pre-gate5-audit-stage3-threshold.db`
重建 Q1 并递交后，插入一笔 Q1 日期、GST 金额 `1,250,000` 分（$12,500）的交易，尝试在 Q2 `include_current`。实际输出：

```json
{
  "q1WorksheetId": 1,
  "q1Amounts": {"g1_cents": 110000, "a1_cents": 10000, "b1_cents": 0, "statement_total_cents": 10000},
  "q2Count": {"count": 0},
  "lateState": {"locked": 0, "closed_period_resolution": null, "belongs_to_closed_period": 1, "closed_period_worksheet_id": 1},
  "error": "更正 GST 金额达到或超过 ATO 现行 $12,500 上限（当前档位：GST turnover < $20m），必须修订原 BAS。 请改选“标为待修订”。"
}
```

因此超限交易没有被锁定或静默并入，Q2 没有生成 worksheet，Q1 的金额没有变化。

### 3.4 年度底稿与关键一致性断言

年度服务 `buildCompanyTaxWorksheet("boyun_co", "FY2026-27")` 的实际输出为：

```text
income_year=FY2026-27
income_cents=1650000 ($16,500.00)
operating_expense_cents=-568000
capital_purchase_cents=1210000
transaction_count=25
```

收入 reconciliation 使用两种口径交叉检查：

```text
四份 BAS 的普通收入 G1（排除 Q4 前期更正）  = 1,540,000 分
Q4 前期更正                                =   110,000 分
普通 BAS G1 + 前期更正                      = 1,650,000 分
年度底稿收入合计                            = 1,650,000 分
四份 BAS 原始 G1（Q4 已包含更正）之和        = 1,650,000 分
```

两种口径均相等，未发现 1 分差异。年度页面截图：[stage3-annual.png](./stage3-annual.png)。浏览器在 `en-US` locale 下检查了年度页面、Q4 底稿及看板；API 返回的 Q4 `g1Cents=690000`、`gstNetCents=2500`、`payg5aCents=5000`、`payg5bCents=1000`、`statementTotalCents=6500`，与页面和 SQL 一致。

### 3.5 备份导出与还原

对同一个年度演练库执行 `/api/backup` 导出，ZIP 实际包含 `app.db`、`manifest.json`、`files/` 及 5 个种子 PDF 文件。manifest 输出：

```text
format=tax-compliance-backup
version=1
timezone=Australia/Melbourne
includesDb=true
includesFiles=true
archiveByteLength=19895
sha256=f9663df50d037e9563eb5c21f41ca4edd11848c96a6523997178d2fd5395758e
```

将 ZIP 还原到临时数据库和临时 files 目录后，实际 SQL diff 为：

```text
entities diff      = []
transactions diff  = []
obligations diff   = []
worksheets diff    = []
source counts      = entities 6, transactions 25, obligations 26, worksheets 4
restored counts    = entities 6, transactions 25, obligations 26, worksheets 4
files diff          = []
```

备份、还原和年度演练均使用独立临时路径；没有覆盖 `docs/evidence/gate0` 至 `docs/evidence/gate5`。

阶段 3 完成。除阶段 2 已记录的 `paid_at` 缺失发现外，本阶段不修改业务代码。

## 阶段 4 · 补全 HANDOVER

已把阶段 2 下半部分要求的 7 条约束补入仓库根目录 `HANDOVER.md` 的第 2.1 节，并为每条列出对应测试文件：

```text
11  Simpler BAS / G10-G11 内部核算       bas-instructions.test.ts, gst-bas-mapping.test.ts, gate3-bas.spec.ts
12  G1 含 GST 选择“是”                  bas-instructions.test.ts, gate3-bas.spec.ts
13  PAYG 5A/5B 与负数退税               bas-generator.test.ts, gst-bas-mapping.test.ts, gate3-bas.spec.ts
14  本期无 PAYG 分期与 nil 生命周期       bas-generator.test.ts, gate3-bas.spec.ts
15  前期更正页面/CSV/PDF 追溯            closed-period-transactions.test.ts, bas-export.test.ts, gate4-closed-period.spec.ts
16  CSV 三种日期格式/预览/完整行 hash     csv-import.test.ts, gate2-csv.spec.ts
17  资讯窗口/预筛/无雇员排除/NULL 日期    news.test.ts, gate4-ai-disabled.spec.ts
```

本阶段只修改了交接文档；没有修改业务逻辑、测试断言或已验收 Gate 证据目录。

## 阶段 5 · 自审

### 5.1 反证法

对每一项“符合”结论，先定义如果结论错误应该出现的现象，再执行相应观察。以下结果来自实际 SQL、运行时 API、浏览器页面或代码库枚举，而不是只引用测试通过。

| 结论 | 如果结论错误，应观察到 | 实际观察 | 结论 |
|---|---|---|---|
| 不自动向 ATO/ASIC 申报 | 出现指向 ATO/ASIC lodgement/submission 的 POST/PUT/PATCH/DELETE | 外部网络枚举只有 AI provider POST、资讯 GET/Coveo POST；未发现申报端点 | 符合 |
| 金额全程整数分 | 出现金额 `parseFloat`、`toFixed` 或非整数写入/计算 | `rg` 未命中 `parseFloat`/`toFixed`；Stage3 SQL/API 金额均为整数分，唯一 `/100` 在显示格式化函数 | 符合 |
| 时区固定为 IANA Melbourne | 出现 UTC+10 固定偏移或 DST 切换前后日期变化 | `lib/time/melbourne.ts` 使用 `Australia/Melbourne` 和 date-fns-tz；BAS/供款顺延运行结果按 Melbourne 日历判定 | 符合 |
| 日期展示不依赖 locale | `en-US` 浏览器出现 `Jul 15, 2026`、`07/15/2026` 或输入占位符为 `mm/dd/yyyy` | `en-US` Playwright 页面及 5 张审计截图均显示 `DD MMM YYYY`；输入旁固定显示 `DD/MM/YYYY` | 符合 |
| TFN 不入库、不发给 AI | schema 有 TFN 列，或 provider/cache 出现原始 TFN | `entities` 无 TFN 列；实际 provider body 和 `ai_cache.redacted_input_json` 不含 TFN/银行账号/地址原值；带 `tfn` 的 settings PATCH 被拒绝 | 符合 |
| AI 结果不直接写 ledger | AI 调用后 transactions/obligations 被新增或改写 | provider failure 的真实前后 SQL 计数相同；`lib/ai` 只写 `ai_cache`，没有 transactions/obligations 写路径 | 符合 |
| 已递交底稿不被后续交易修改 | Q1 递交后补录 Q1 交易导致 Q1 金额或快照变化 | Stage3 Q1 worksheet 补录前后金额一致；新交易另挂原 worksheet 并在 Q4 选择后续处理 | 符合 |
| 外部测试基准不是自算冒充 | 测试中直接写入实现者算出的 `1_747_034`，没有外部 fixture 来源 | 测试从 `tests/fixtures/div7a/ato-baseline.json` 读取，包含 ATO calculator URL 与 `2026-08-27` 取数日期；官方基准 UI/API/服务结果一致 | 符合 |
| `blocked` 逐义务判断 | 缺 ASIC 配置导致同一主体 BAS/公司税表也变 blocked | 清空 Yeeliving ACN/ASIC 后，仅 ASIC 为 blocked 且日期 NULL；4 BAS 与公司税表均为 todo 且日期与 Boyun 一致 | 符合 |
| 顺延方向不是一刀切 | 2029-06-30 供款/信托决议被推到 2029-07-02 | 实际计算为 `2029-06-29`；BAS/税表/ASIC 仍使用 forward | 符合 |
| Simpler BAS 指引不含 G10/G11 | 指引卡把 G10/G11 列成需要填写的 ATO 格 | 实际指引数组只有 G1、1A、1B；G10/G11 在底稿“内部核算”区并标注“不填入 ATO 表单” | 符合 |
| G1 含 GST 选择项存在 | 指引缺少“该金额是否含 GST”或没有“是” | 实际指引包含“填写 G1 后，对‘该金额是否含 GST’选择‘是’” | 符合 |
| PAYG 5A/5B 公式正确 | 5B 被加而非减，或负数被拒绝/显示为应缴 | 真实输出 `gstNet=-5000, 5A=0, 5B=1000, statementTotal=-6000, statementType=refund` | 符合 |
| 无 PAYG 可显式完成 nil BAS | 空白 PAYG 永远无法 lodged/paid | 实际勾选无 PAYG 后写入 5A/5B=0，statement total=0，并完成 lodged、paid | 符合 |
| 前期更正三处可追溯 | 页面、CSV 或 PDF 缺少汇总/原 worksheet | Stage3 页面、CSV、PDF 均有 1 笔/$1,100 汇总和原 Q1 worksheet `#1` | 符合 |
| CSV 日期格式与去重安全 | `03/04/2026` 两种格式得到同一日期，或同日同额不同商户被去重 | DD/MM 得 2026-04-03/Q4，MM/DD 得 2026-03-04/Q3；不同描述保留，完全相同行才 duplicate | 符合 |
| 资讯筛选与未知日期安全 | 旧文/无关主题进入主列表，或未知日期被伪造为抓取日 | 真实结果主列表 9 条、排除区 12 条、未知日期 38 条；ATO 总计 100 条且 38 条为 NULL；SQL 显示非空日期有 35 个不同日期 | 符合 |
| 养老金上限按所得年度 | FY2025–26 和 FY2026–27 读取相同的 $30,000 | SQL/API/UI 分别为 $30,000 与 $32,500；每行保留 ATO URL 和取数日期 | 符合 |
| Div 7A 逐年重算并正确到期 | 连续年度金额相同，或期限结束后仍显示最低还款 | 五年序列为 0、1,747,034、1,989,117、2,328,936、2,839,797；FY2024–25 状态为 expired/已到期 | 符合 |
| 年度清单按主体类型 | 个人卡片出现 franking/FTE，信托缺 FTE，公司缺 franking/Div7A | 实际截图与服务输出：个人仅折旧/结转亏损；信托含 FTE；公司含 franking 与 Div7A | 符合 |
| 备份可还原 | 还原后四类核心记录或 files 出现 diff | ZIP 含 db/files；entities、transactions、obligations、worksheets、files diff 均为 `[]`，计数一致 | 符合 |

### 5.2 UI / API / SQL 三处交叉

下表只列审计中最关键的日期和金额断言。UI 使用实际浏览器截图，API 使用真实 HTTP 响应，SQL 使用同一证据数据库的实际查询；金额统一把 UI AUD 显示换算回整数分比较。

| 断言 | UI | API | SQL | 结果 |
|---|---|---|---|---|
| Boyun Q4 BAS 日期 | Q4 页面：截止 `28 Jul 2027`；实际工作日 `11 Aug 2027` | `/api/bas/12`：`statutoryDue=2027-07-28`、`effectiveDue=2027-08-11` | `obligations` 同两列 ISO 日期 | 一致 |
| Boyun Q4 BAS 金额 | 页面 G1 `$6,900.00`、GST net `$25.00`、应缴 `$65.00` | `g1Cents=690000`、`gstNetCents=2500`、`statementTotalCents=6500` | `bas_worksheets` 对应列 `690000/2500/6500` | 一致 |
| 年度收入 | 年度页 Boyun `$16,500.00` | `/api/annual?fy=2026-27`：`incomeCents=1650000` | Stage3 年度 SQL `income_cents=1650000` | 一致 |
| FY2026–27 concessional cap | 养老金页年度上限 `$32,500.00` | `/api/super?person=self&fy=2026-27`：`capCents=3250000` | `super_caps`：`concessional_cap_cents=3250000` | 一致 |
| Div 7A 官方年度基准 | `stage5-div7a.png`：FY2017–18 最低还款 `$17,470.34` | `/api/div7a?loanId=1&fy=2017-18`：`minimumRepaymentCents=1747034` | `div7a_loans` 输入行：本金 `10000000`、期限 `7`、手动利率 `0.053`；派生结果由服务按该行计算 | 输入与派生结果一致 |

### 5.3 截图目视检查

已逐张使用图像查看器检查审计目录中的 6 张截图：

```text
super-cap.png          FY2026–27 $32,500 / $130,000 可见，来源日期可见，无截断
annual-types.png       个人、信托、公司卡片均可见，清单字段按类型区分，无重叠
stage3-dashboard.png   六主体列、Q1–Q4 状态/日期可见，无空白错位
stage3-q4-correction.png  更正汇总、G1/1A/1B、G10/G11、PAYG、交易追溯均可见
stage3-annual.png      Boyun $16,500、个人/信托/公司清单均可见，无错位
stage5-div7a.png       FY2017–18、$17,470.34、原始期限/当前剩余、还款日均可见
```

上述截图均位于 `docs/evidence/pre-gate5-audit/`；没有覆盖或删除 `docs/evidence/gate0` 至 `docs/evidence/gate5` 的文件。真实手机摄像头拍照上传没有测试，符合原验收边界，不将其描述为已验证。

### 5.4 主动暴露的三处最没把握点及针对性验证

1. **测试临时数据库的正常退出清理**：最担心测试进程异常时留下临时库。两次全量测试完成后执行 `find /tmp -maxdepth 1 -type d -name 'tax-compliance-vitest-*'`，无输出；因此正常完成路径没有残留。异常终止后的操作系统级清理没有验证，保留在未能验证项。
2. **paid 状态的付款日期完整性**：之前只看状态容易漏掉日期字段。针对性 SQL 查询 Stage3 四个 BAS，结果是 Q1–Q4 均 `status=paid` 但 `paid_at=NULL`；这不是通过，而是阶段 2 已记录的中严重发现，未在本轮修复。
3. **真实 ATO 资讯发布日期质量**：之前的列表抓取曾出现统一日期风险。针对性查询 ATO source id `1` 得 `total=100`、`null_dates=38`、`distinct_dates=35`、`last_error=NULL`；当前未知日期被隔离而非伪造，但 38 条仍未进入文章页深挖，列入 backlog。

### 5.5 审计发现清单

本轮除用户授权的测试隔离修复和阶段 4 文档补写外，没有修复业务缺陷。实际发现如下：

| 严重程度 | 现象 | 影响 | 位置 |
|---|---|---|---|
| 高（历史基线） | Gate 0–4 原始全量测试共享 `./data/test.db`，seed 测试在全量运行时读到 26 条遗留义务 | 旧 Gate 的“全量通过”不能作为隔离可靠证据；已在 `5b95a92` 只修复测试隔离 | `tests/setup.ts` 历史；原始 `seed.test.ts` 运行 |
| 中 | `paid` 状态转换没有写入 `paid_at` | 付款日期报表、审计检索和依赖付款日期的提醒无法区分具体付款日 | `lib/domain/obligations/state-machine.ts:44-58` |
| 中（数据质量） | 真实 ATO 资讯 100 条中 38 条发布日期未知 | 这些条目只能留在未知区，无法参加时间窗口排序；后续需要文章页补取 | `lib/news/fetch.ts` 的 ATO article hydration 路径；ATO source id 1 |

依赖漏洞按用户要求只记录，不执行 `npm audit fix`：`drizzle-orm`、Next 嵌套 `postcss`、`sharp` 三个 high，具体运行时归属见任务 B 表格。

### 5.6 未能验证项

本章节刻意保留非空，避免把审计边界误报为通过：

- 没有向真实 ATO 或 ASIC lodgement 端点提交数据；系统设计也禁止自动申报，因此只能验证“没有申报路径”，不能验证未来真实申报流程。
- 没有验证真实手机摄像头权限、拍照、系统分享面板和移动端文件选择器；只验证了窄屏/响应式页面，不声称移动上传已通过。
- 没有使用生产 AI provider 凭据做真实模型调用；本轮验证的是关闭降级、脱敏和 provider stub/失败路径，不能代表外部 provider 的可用性或模型输出质量。
- ATO 的 38 条 `published_at=NULL` 没有逐篇进入文章页补取；当前“未知并隔离”已验证，真实首发日期本身仍未知。
- 没有在异常 kill/断电场景验证 Vitest 临时目录清理；只验证正常测试进程结束后没有 `tax-compliance-vitest-*` 残留。
- Stage3 PDF 文本内容已抽取核对，但本轮没有把每个 PDF 页面单独用 PDF 渲染器再做像素级目视检查；网页上的 PDF 对应汇总行已核对。

## 审计结论

阶段 0（含授权的隔离修复）、阶段 1、阶段 2、阶段 3、阶段 4、阶段 5 均已完成；新的真实基线为 29 个文件 / 143 个用例 / 143 通过，E2E 为 9 个文件 / 14 个 test declaration，lint 和 build 通过。审计发现仅报告未修复，`gate-5` 标签未创建，现停下来等待验收。
