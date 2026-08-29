# Gate 5 修复后的复核报告

复核日期：2026-08-29（Australia/Melbourne）
代码提交：`a6681bafe351bd68d642e1e8e1b3e26ba8a45ec8`
本报告只覆盖本轮授权的三项修复；未创建 `gate-5` 标签，也未修改 `docs/evidence/gate0` 至 `docs/evidence/gate5`。

## 1. 干净 clone 回归

从 `main` 的上述提交建立全新 clone：`/tmp/tax-compliance-clean3-LnIENh/clone`。使用 Node `v26.7.0`、npm `11.19.0`，依次执行 `npm ci`、`npm run db:migrate`、`npm run db:seed`。

| 检查 | 实际命令/结果 |
|---|---|
| 全量测试（普通顺序） | `npm test -- --run --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism --reporter=verbose`：29 个文件，149 个用例，149 通过，0 失败 |
| 全量测试（随机顺序） | 同上加 `--sequence.shuffle`，seed `1787975588001`：29 个文件，149 个用例，149 通过，0 失败 |
| lint | `npm run lint`：退出码 0 |
| build | `npm run build`：Next.js 15.5.24 编译、lint/typecheck、静态页面生成全部通过 |

`npm ci` 报告了依赖树中的 8 个漏洞（其中 3 个 high）；本轮没有运行 `npm audit fix`，也没有改变依赖版本。

## 2. 阶段 3 年度演练：不含 GST 口径

使用原阶段 3 的 Boyun 25 笔交易数据库重跑。BAS 仍按 G1 含 GST、1A 为销项 GST；年度底稿改为 `amount_cents - gst_cents`，并排除 `PRIVATE`。

以下金额均为整数分：

| 期间 | G1 | 1A | 1B | G10 | G11 | 5A | 5B | statementTotal | 状态 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| FY2026–27 Q1 | 190,000 | 10,000 | 25,000 | 220,000 | 55,000 | 2,500 | 0 | -12,500 | paid |
| FY2026–27 Q2 | 320,000 | 20,000 | 32,500 | 275,000 | 80,000 | 3,000 | 500 | -10,000 | paid |
| FY2026–27 Q3 | 450,000 | 30,000 | 40,000 | 330,000 | 105,000 | 0 | 0 | -10,000 | paid |
| FY2026–27 Q4 | 690,000 | 50,000 | 47,500 | 385,000 | 130,000 | 5,000 | 1,000 | 6,500 | paid |

年度底稿实际结果：

| incomeCents（不含 GST） | operatingExpenseCents（不含 GST） | capitalPurchaseCents（不含 GST） | netProfitCents（不含 GST） | 交易数 |
|---:|---:|---:|---:|---:|
| 1,540,000 | -533,000 | 1,100,000 | 1,007,000 | 25 |

一致性断言已改为：

`四份 BAS 的 G1 合计 − 1A 合计 = 年度收入合计`

实际值为 `1,650,000 − 110,000 = 1,540,000`，与年度 `incomeCents = 1,540,000` 一致。年度页面截图中的收入、费用、资本采购和来源交易均标为“不含 GST”：[`annual-net-basis.jpg`](./annual-net-basis.jpg)。

仓库当前没有独立的年度 CSV/PDF 文件导出路由；`/api/annual` JSON 响应已增加 `amountBasis: "GST-exclusive"`。现有 CSV/PDF 导出是 BAS 底稿导出，不冒充年度税表导出。

## 3. Div 7A 逐年余额

`div7a_loans.term_years` 的语义是原始合同期限；`remainingTermYears` 是按评估所得年度推导的当前剩余期限。贷款发放所得年度最低还款为 0；余额按“上一年度末余额 + 本年手动基准利息 − 本年已记录还款”滚动。

一笔本金 10,000,000 分、2017-05-15 发放、基准利率 0.053、原始期限 7 年的“每年恰好还最低额”序列如下：

| 所得年度 | 期初余额 | 本年利息 | 最低还款 | 实际还款 | 期末余额 | 状态 |
|---|---:|---:|---:|---:|---:|---|
| FY2016–17 | 10,000,000 | 0 | 0 | 0 | 10,000,000 | origination |
| FY2017–18 | 10,000,000 | 530,000 | 1,747,034 | 1,747,034 | 8,782,966 | active |
| FY2018–19 | 8,782,966 | 465,497 | 1,747,035 | 1,747,035 | 7,501,428 | active |
| FY2019–20 | 7,501,428 | 397,576 | 1,747,034 | 1,747,034 | 6,151,970 | active |
| FY2020–21 | 6,151,970 | 326,054 | 1,747,035 | 1,747,035 | 4,730,989 | active |
| FY2023–24 | 1,659,102 | 87,932 | 0 | 0 | 1,747,034 | expired |

同一输入但一分未还时，FY2019–20 为：期初 `10,530,000`、最低还款 `2,094,540`、期末 `11,088,090`；因此第三年的余额和最低还款均与“每年还最低额”不同。

官方基准测试仍读取 [`tests/fixtures/div7a/ato-baseline.json`](../../../tests/fixtures/div7a/ato-baseline.json)，而不是由实现代码生成期望值。输入为 `$100,000 / 5.30% / 7 年 / 2017–18`，ATO 官方输出为 `1,747,034` 分，来源与取数日期写在 fixture 和测试注释中，测试通过。页面截图分别显示活跃年度的期初余额/利息/实际还款/期末余额：[`div7a-yearly-balances.jpg`](./div7a-yearly-balances.jpg)，以及 FY2023–24 已到期：[`div7a-expired.jpg`](./div7a-expired.jpg)。

## 4. 用户输入的递交/缴款日期

浏览器实际输入 `15/01/2027` 递交、`03/02/2027` 缴款；页面回显为固定格式 `15 Jan 2027`、`03 Feb 2027`。同一运行的 SQL 为：

```text
id  status  lodged_at   paid_at
--  ------  ----------   ----------
15  paid    2027-01-15  2027-02-03
```

页面视觉证据：[`obligation-dates.jpg`](./obligation-dates.jpg)。API 与状态机现在都要求目标日期由用户传入，缺失时拒绝，不使用当天日期。

## 5. 本轮测试断言变更清单

以下是唯一修改旧期望值的地方，原因都是旧断言编码了本轮明确判定为错误的口径：

- `tests/unit/annual-worksheets.test.ts`：`netProfitCents` 从 `88_000` 改为 `80_000`，因为年度费用从含 GST 改为不含 GST；同时增加 G1 含 GST 与年度收入不含 GST、运营费用/资本采购净额及 PRIVATE 排除测试。
- `tests/unit/div7a.test.ts`：旧的 `9_000_000` / `9_000_000` 余额期望改为包含利息滚动的 `9_530_000` / `10_035_090`；增加已还/未还第三年差异测试。
- `tests/unit/div7a.test.ts`：期限边界期望从 FY2024–25 到期调整为 FY2023–24 到期，符合本轮验收口径；FY2026–27 继续断言为已到期且最低还款为 0。

其余新增或更新的测试只是为用户日期参数补齐调用，未放宽或替换原业务断言。官方 ATO 基准 `1_747_034` 未修改。

## 6. 证据与范围确认

- 新截图只写入本目录 `docs/evidence/post-audit-fixes/`；Gate 0–Gate 5 既有证据未改动。
- 未创建 `gate-5` 标签；现有 `gate-0` 至 `gate-4` 标签未改动。
- `HANDOVER.md` 的 Gate 5 候选提交和当前测试基线已更新为本轮真实结果。
