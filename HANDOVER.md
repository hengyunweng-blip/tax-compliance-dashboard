# 澳洲多主体税务合规看板：项目交接

交接日期：2026-08-29（Australia/Melbourne）  
仓库分支：`main`  
Gate 5 原始实现与证据提交：`2cf10f8b723fce0d815ff801720e24acac149814`
本轮三项修复提交：`a6681bafe351bd68d642e1e8e1b3e26ba8a45ec8`
Gate 5 尚未验收，因此没有 `gate-5` 标签。

## 1. 当前状态

| Gate | 状态 | 标签 | Commit |
|---|---|---|---|
| Gate 0 | 已验收 | `gate-0` | `799153ee74cd246bb7db3a11d9e1d8f4c2292a2d` |
| Gate 1 | 已验收 | `gate-1` | `747ef29ff3ef8e7796e78e5725a8de5e1c7c22e6` |
| Gate 2 | 已验收 | `gate-2` | `0607d4aee92e8c46f538cd1b7a5497f66daa4e50` |
| Gate 3 | 已验收 | `gate-3` | `78e7c1762c150e7a9167c1e0fcdd654721ef0fb9` |
| Gate 4 | 已验收 | `gate-4` | `691ba4854acdd977dc09e143101eb432e672f592` |
| Gate 5 | 已实现并完成本地验证，待用户验收 | 无标签 | `a6681bafe351bd68d642e1e8e1b3e26ba8a45ec8` |

Gate 5 已实现并验证：

- 年度公司、信托、个人底稿按 `income_year` 聚合，待人工补充项按主体类型区分。
- 年度收入、运营费用和资本采购按不含 GST 口径计算；BAS G1 保持含 GST，年度页面标明口径。
- Div 7A 使用 ATO 官方计算器基准，贷款发放年度最低还款为零，按上一年度末余额和当前剩余年限逐年重算，期限结束后显示“已到期”。
- Div 7A 余额逐年滚动计入手动基准利息并扣除已记录还款；`term_years` 是原始合同期限，`remainingTermYears` 是评估年度推导值。
- 已递交与已缴款状态分别保存用户输入的 `lodged_at` / `paid_at`，不使用当前日期默认值。
- 养老金 concessional / non-concessional 上限按所得年度存储，FY2026–27 为 $32,500 / $130,000。
- 备份 ZIP 与还原流程已完成实际验证。
- Div 7A 年度切换的前端请求乱序问题已修复。

Gate 5 仍未完成的事项是用户验收，以及下方“待办与边界”中的人工或后续工作；不得在用户验收前创建 `gate-5` 标签。

## 2. 不可违反的约束

1. 不对 ATO 或 ASIC 自动申报、自动提交或自动付款；系统只生成底稿、提醒和人工操作指引。
2. 所有金额一律以整数分存储、计算和传输；显示时才换算为 AUD。禁止浮点金额。
3. 业务时区固定为 IANA 标识 `Australia/Melbourne`，禁止用固定 UTC+10 或其他固定偏移代替。
4. 所有只读日期统一显示为 `DD MMM YYYY`，例如 `15 Jul 2026`；输入统一使用 `DD/MM/YYYY`，不得依赖浏览器 locale。
5. TFN 不入库、不写入导出、不写入 AI payload；只能保留需求允许的非敏感提示信息。
6. AI 输出始终是建议，未经用户明确确认不得写入 `transactions`、`obligations`、金额或申报状态。
7. 已递交或已缴款的底稿不可修改；后续交易必须走前期更正/待修订决策并写入审计记录。
8. 测试基准不得使用实现者自算值冒充外部基准；需要官方数值时必须记录官方来源 URL 和取数日期；无法取得时使用 `test.skip` 并报告待人工核对。
9. `blocked` 必须逐义务判断，不能由一个主体缺失的字段扩散到该主体的其他义务。
10. 非工作日顺延必须显式区分 `adjustment_direction`：`forward` 调整到下一个工作日，`backward` 调整到上一个工作日。

### 2.1 前期 Gate 约束的测试依据

以下约束同样不可违反；括号内列出当前对应的测试文件：

11. Simpler BAS 操作指引只能列 G1、1A、1B；G10/G11 只能作为内部核算字段，并明确标注“不填入 ATO 表单”。（`tests/unit/bas-instructions.test.ts`、`tests/unit/gst-bas-mapping.test.ts`、`tests/e2e/gate3-bas.spec.ts`）
12. 指引必须包含：填写 G1 后，对“该金额是否含 GST”选择“是”。（`tests/unit/bas-instructions.test.ts`、`tests/e2e/gate3-bas.spec.ts`）
13. PAYG 必须拆分为 5A 应缴与 5B 贷记，公式为 `statementTotal = gstNet + 5A - 5B`；总额允许为负并显示为退税。（`tests/unit/bas-generator.test.ts`、`tests/unit/gst-bas-mapping.test.ts`、`tests/e2e/gate3-bas.spec.ts`）
14. 必须存在“本期无 PAYG 分期”的显式选项；勾选后 nil BAS 可以完成 `draft_ready → lodged → paid`。（`tests/unit/bas-generator.test.ts`、`tests/e2e/gate3-bas.spec.ts`）
15. 前期更正必须在底稿页面、CSV 导出和 PDF 导出中显示汇总行，并保留原属期间及原 worksheet 追溯信息。（`tests/unit/closed-period-transactions.test.ts`、`tests/unit/bas-export.test.ts`、`tests/e2e/gate4-closed-period.spec.ts`）
16. CSV 导入必须提供 `DD/MM/YYYY`、`YYYY-MM-DD`、`MM/DD/YYYY` 三种日期格式选择，预览显示解析后的 `DD MMM YYYY` 日期；去重键必须包含完整原始行（含描述）的 SHA-256、解析日期和金额分。（`tests/unit/csv-import.test.ts`、`tests/e2e/gate2-csv.spec.ts`）
17. 资讯主列表必须同时应用默认 90 天窗口和关键词命中过滤；无雇员时排除 payroll、STP、Payday Super、SBSCH、燃油税抵免等主题；无法取得发布日期时写入 `NULL`，不得回落到抓取日。（`tests/unit/news.test.ts`、`tests/e2e/gate4-ai-disabled.spec.ts`）

## 3. 验收协议

- 每完成一个 Gate 必须硬停止，等待用户逐项验收；未获验收不得跨 Gate 开发或打后续标签。
- 每个 Gate 的截图和运行证据必须写入自己的 `docs/evidence/gateN/` 目录。
- 已验收 Gate 的证据文件不得覆盖、删除或用后续 Gate 的截图替换。
- 真实手机拍照、摄像头权限和手机系统上传流程不属于自动化验收范围；只能报告窄屏响应式布局已验证。
- `data/*.db` 是本地运行或一次性证据数据库，不入仓；应用默认使用 `./data/app.db`，只有显式设置 `DATABASE_PATH` 才使用其他路径。

## 4. 已验证关键常量、来源与日期

### 4.1 FY2026–27 BAS

来源：[ATO — Due dates for lodging and paying your BAS](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/due-dates-for-lodging-and-paying-your-bas)。来源与规则于 2026-08-29（Australia/Melbourne）核对；实际日同时经过项目的维州周末/公众假日和线上自办规则计算。

| 期间 | 法定日 `statutory_due` | 实际日 `effective_due` | 说明 |
|---|---|---|---|
| Q1 | 28 Oct 2026 | 11 Nov 2026 | 线上自办 +14 天 |
| Q2 | 28 Feb 2027 | 01 Mar 2027 | 周日顺延；不再加两周 |
| Q3 | 28 Apr 2027 | 12 May 2027 | 线上自办 +14 天 |
| Q4 | 28 Jul 2027 | 11 Aug 2027 | 线上自办 +14 天 |

三家公司各四条，共 12 条 BAS，均使用上述对应日期。BAS 的 `income_year` 与 `deadline_fy` 均为 `FY2026-27`。

### 4.2 ASIC 年检费

FY2026–27 普通 proprietary company 年检费参考值为 `$342`（`34,200` 分）。来源：[ASIC — Fees for commonly lodged documents](https://asic.gov.au/for-business-and-companies/forms-and-fees/all-fees/fees-for-commonly-lodged-documents)，取数日期 2026-08-29。系统只显示人工核对提示，不自动付款。

### 4.3 牌照年度声明

来源：[Consumer Affairs Victoria — Annual statement and fees for estate agents](https://www.consumer.vic.gov.au/licensing-and-registration/estate-agents/licensing/maintain-your-licence/annual-statement-and-fees)，取数日期 2026-08-29；线上入口为 [myCAV](https://my.consumer.vic.gov.au)。

- 窗口开启日 = 周年日前 6 周 = `-42` 天。
- 周年日本身是 `statutory_due`，不能把窗口开启日当截止日。
- 逾期 21 天仍未完成时显示自动注销后果；不自动向监管机构提交。
- 测试值 `15 Aug 2026`：窗口开启 `04 Jul 2026`，截止 `15 Aug 2026`，`backward` 工作日校准后 `effective_due = 14 Aug 2026`，注销后果日期 `05 Sep 2026`。

### 4.4 GST 更正限制

代码常量在 `lib/domain/bas/gst-correction-policy.ts`。来源和取数日期：

- [ATO — Correcting GST errors](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/managing-gst-in-your-business/reporting-paying-and-activity-statements/correcting-gst-errors)
- [ATO Legislative Determination LI 2023/32](https://www.ato.gov.au/law/view/pdf/ldt/li2023-032.pdf)
- [ATO — Period of review](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/managing-gst-in-your-business/reporting-paying-and-activity-statements/period-of-review)
- 取数日期：2026-08-27

当前主体使用 `< $20m` GST turnover 档位：净 debit GST error 必须严格小于 `$12,500`（`1,250,000` 分），并须在原到期日后 18 个月内更正；credit error 使用 4 年 + 1 天的审查期保护。达到金额或时间限制时，系统禁止 `include_current`，必须修订原 BAS。

### 4.5 Div 7A 官方基准

来源：[ATO Division 7A calculator and decision tool](https://www.ato.gov.au/calculators-and-tools/division-7a-calculator-and-decision-tool?page=1)，取数日期 2026-08-27（Australia/Melbourne）。实际输入：2016–17 所得年度、无担保贷款、本金 `$100,000.00`、手动基准利率 `5.30%`、7 年，评估 2017–18；官方输出最低年度还款 `$17,470.34`，保存为 `1,747,034` 分。

该数值来自官方计算器，不是测试实现自行计算出来的基准。`div7a_loans.term_years` 是原始合同期限；`remainingTermYears` 是评估年度推导的当前剩余期限。

### 4.6 养老金上限

每个所得年度存储在 `super_caps`，来源与取数日期均保留在表中。concessional 来源：[ATO concessional contributions cap](https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap)；non-concessional 来源：[ATO non-concessional contributions cap](https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap)。完整分段表取数日期：2026-08-29。

| 所得年度 | concessional cap | non-concessional cap |
|---|---:|---:|
| FY2021–22 | $27,500（2,750,000 分） | $110,000（11,000,000 分） |
| FY2022–23 | $27,500（2,750,000 分） | $110,000（11,000,000 分） |
| FY2023–24 | $27,500（2,750,000 分） | $110,000（11,000,000 分） |
| FY2024–25 | $30,000（3,000,000 分） | $120,000（12,000,000 分） |
| FY2025–26 | $30,000（3,000,000 分） | $120,000（12,000,000 分） |
| FY2026–27 | $32,500（3,250,000 分） | $130,000（13,000,000 分） |

追补规则保留 5 年和 `$500,000` TSB 门槛，来源为 [ATO caps and limits](https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions)，取数日期 2026-08-27；个人实际可用追补额度不是由本地账本推算，当前需人工输入或核对。

## 5. 环境重建步骤

已验证 Node：`v26.7.0`。

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

`.env.local` 需要配置的变量名如下（本文件不包含任何值）：

```text
DATABASE_PATH
INGEST_TOKEN
AI_ENABLED
AI_API_URL
AI_API_KEY
AI_MODEL
AI_TIMEOUT_MS
```

`DATABASE_PATH` 未设置时使用 `./data/app.db`。Gate 5 证据使用的 `data/gate5-evidence-final5.db` 是一次性证据数据库，应用不会自动读取它；只有显式设置 `DATABASE_PATH` 才会切换数据库。`.env.local` 和 `data/*.db` 已被 `.gitignore` 排除，不能入仓。

默认数据库已实际执行 `migrate + seed`；`super_caps` 包含上述六个历史/当前年度行，六个固定主体也已写入。

## 6. 当前验证基线

- Vitest：29 个单元测试文件，149 个用例，全部通过（干净 clone 普通顺序与随机顺序均通过）。
- Playwright：9 个 E2E 文件，14 个 test declarations；Gate 5 最终回归 `1 passed`。
- `npm run lint`：通过。
- `npm run build`：通过，Next.js 15.5.24 production compile、lint/typecheck 和静态页面生成通过。
- Gate 5 最终截图只写入 `docs/evidence/gate5/`：`annual-worksheets.png`、`div7a-official-baseline.png`、`super-backup.png`。

## 7. Backlog 与明确边界

- Gate 4 资讯 backlog：真实 ATO 100 条中有 38 条无法确认首发 `published_at`；当前保持 `NULL`，单独放在“日期未知”区，不猜测日期。后续可尝试进入文章页提取明确发布日期，Gate 5 未处理。
- 年度底稿中的折旧、结转亏损、franking account 余额、Div 7A 借款余额、信托 FTE 状态仍需用户人工补充或核对；个人追补可用额度也需以 ATO 记录输入。
- 2027 AFL Grand Final Friday 的官方日期若公布，需要按年度更新维州公众假日数据；代码不得预先猜测。
- 系统不负责真实 ATO/ASIC 申报、付款、签署或手机摄像头验证。
- Gate 5 用户验收完成后，才可把当前实现 commit 打 `gate-5` 标签；在此之前保留现有 `gate-0` 至 `gate-4` 标签不变。

## 8. 仓库清单确认

- `docs/superpowers/specs/`：存在。
- `docs/superpowers/plans/`：存在。
- `docs/evidence/gate0/` 至 `docs/evidence/gate5/`：均存在；各 Gate 使用独立证据目录。
- 已有标签：`gate-0`、`gate-1`、`gate-2`、`gate-3`、`gate-4`。
- `gate-5`：按验收协议尚未创建。
- `.env.local`：未跟踪。
- `data/*.db`：未跟踪。
