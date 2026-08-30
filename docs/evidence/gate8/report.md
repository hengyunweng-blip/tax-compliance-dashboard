# Gate 8 交付与自审报告

执行日期：2026-08-30（Australia/Melbourne）

本轮开始前已确认 `gate-7`：`a9df387fbfcd7a0ff00fce0cec94813d68f71a7e`。Gate 8 实现与本目录证据的代码提交为 `807c5c7489652d320b2517fd8f79b40d7fb8022e`。本轮没有创建 `gate-8`，也没有修改 `docs/evidence/gate0` 至 `docs/evidence/gate7`。

证据数据库 `gate8-ui.db` 只作为本机运行证据保留，未加入 Git；JSON、SQL、ZIP 与截图在本目录。金额均为整数分，报告中的 `$` 金额仅为显示换算。

## A. Div 7A 补强

### A1. Section 109R 风险提示

已核对 ATO 关于 s109R 的官方资料：同一私人公司在还款前后向同一借款人提供相似或更大金额的安排，是否应忽略还款取决于事实与意图，系统不能自动作法律判断。

- 官方来源：<https://www.ato.gov.au/api/public/content/0-4f686e44-3c3f-424f-b3b9-7b8455aefd47>
- 取数日期：2026-08-30
- 代码位置：`lib/domain/div7a/repayment-validity.ts`
- 默认筛查窗口：30 个日历日。这是本系统的内部风险筛查窗口，不是 ATO 规定的安全港；可在设置中改为 1–365 的整数。
- 触发条件：同一贷款方、同一借款人，在还款前后窗口内出现金额相同或更大的公司支出或新增贷款。
- 处理方式：只显示「还款有效性存疑 · 请核对 s109R」，不会自动把还款计入最低还款；用户必须选择「已核对无重借」或「确认不计入」，选择写入 `audit_log`。

实际测试文件 `tests/unit/div7a-repayment-validity.test.ts` 的 3 个用例全部通过：

1. 30 Jun 2027 还款后 1 Jul 2027 出现同额支出，触发风险，`actualRepaymentCents = 0`；
2. 只有还款、没有后续相关活动，不触发风险；
3. 用户确认后还款才计入，并留下审计记录。

Gate 8 走查中的实际证据也包含一笔 100,000 分还款和 1 Jul 同额支出，见 [div7a-cross-check.json](./div7a-cross-check.json) 与 [div7a-risk-and-schedule.png](./div7a-risk-and-schedule.png)。

### A2. 合并贷款展示

同一贷款方、同一借款人、同一原始所得年度、同一最高期限的贷款在页面上分组显示，协议义务仍按 `scope_key = loan:<id>` 独立生成。

- 页面实际显示 Boyun 的两笔贷款合并组，合计最低还款为 `266,166` 分（$2,661.66）。
- 不同借款人、所得年度、担保类型或 `unknown` 担保类型不会合并。
- 官方来源：<https://www.ato.gov.au/api/public/content/0-df9bf50b-461c-4f07-b86b-f6fe8b2cc89a>
- 取数日期：2026-08-30
- 代码与测试：`lib/domain/div7a/amalgamated.ts`、`tests/unit/div7a-amalgamated.test.ts`（2/2）。

## B. 轻量资产登记与折旧

已实现 `assets` 登记、非 GST 成本、有效年限、prime cost / diminishing value、私人使用比例、期初累计折旧与账面余额、处置字段，以及 FY2026–27 的年度折旧汇总。车辆只显示事实清单警告，没有实现 FBT 计算。

实际 FY2026–27 证据：

| 主体 | 资产 | 总折旧 | 私人使用调整后可抵扣额 | 账面减少 | 差额 |
| --- | --- | ---: | ---: | ---: | ---: |
| Boyun | vehicle，prime cost | 200,000 分 | 160,000 分 | 200,000 分 | 0 |
| Yeeliving | equipment，diminishing value | 800,000 分 | 800,000 分 | 800,000 分 | 0 |
| Neighbourhood | equipment，prime cost | 100,000 分 | 100,000 分 | 100,000 分 | 0 |

页面显示、API 结果和 SQL 资产登记分别见：

- [assets-depreciation-cross-year.png](./assets-depreciation-cross-year.png)
- [api-assets-fy2026-27.json](./api-assets-fy2026-27.json)
- [sql-assets.txt](./sql-assets.txt)
- [assets-cross-check.json](./assets-cross-check.json)

`tests/unit/assets.test.ts` 6/6 通过，覆盖两种方法五年序列、首年按天数、私人使用调整、期初余额接续、处置年度比例和未配置期初余额不产生金额。

## C. 六主体、两个所得年度走查

### C1. 财年滚动与假日未配置行为

独立证据数据库中实际调用 `ensureObligationsForFy`：

| 操作 | 义务数 |
| --- | ---: |
| 首次展开 FY2026–27 | 30 |
| 重复展开 FY2026–27 | 30 |
| 首次展开 FY2027–28 | 30 |
| 重复展开 FY2027–28 | 30 |
| FY2026–27 BAS | 12 |
| FY2027–28 BAS | 12 |

FY2026–27 保持已验收日期：

| 期间 | statutory_due | effective_due |
| --- | --- | --- |
| Q1 | 28 Oct 2026 | 11 Nov 2026 |
| Q2 | 28 Feb 2027 | 01 Mar 2027 |
| Q3 | 28 Apr 2027 | 12 May 2027 |
| Q4 | 28 Jul 2027 | 11 Aug 2027 |

FY2027–28 实际展开结果：

| 期间 | statutory_due | effective_due | 说明 |
| --- | --- | --- | --- |
| Q1 | 28 Oct 2027 | 11 Nov 2027 | 2027 假日已配置 |
| Q2 | 28 Feb 2028 | NULL | 工作日校准待配置 |
| Q3 | 28 Apr 2028 | NULL | 工作日校准待配置 |
| Q4 | 28 Jul 2028 | NULL | 工作日校准待配置 |

2028 假日没有被规律外推；提醒在 `effective_due` 为 NULL 时使用 `statutory_due`。证据见 [rollover-two-fy.json](./rollover-two-fy.json)、[api-obligations-fy2026-27.json](./api-obligations-fy2026-27.json)、[api-obligations-fy2027-28.json](./api-obligations-fy2027-28.json)、[sql-obligations-two-fy.txt](./sql-obligations-two-fy.txt)。

没有发现“新财年展开后看板为空”的现象；幂等性也没有发现重复记录。但是当前执行日期仍是 2026-08-30，无法真实等待系统墙上日期跨过 2027-07-01 后再观察浏览器自动触发，因此“真实时钟跨年自动触发”列为未能验证项，见本文最后一节。

### C2. 六主体走查

实际主体为：

| ID | 类型 |
| --- | --- |
| `self` | individual |
| `spouse` | individual |
| `boyun_trust` | trust |
| `boyun_co` | company |
| `yeeliving_co` | company |
| `neighbourhood_co` | company |

走查数据库生成了三家公司各四条 BAS；Neighbourhood 是全 nil BAS；三家公司各有年度税表、ASIC、Div 7A/协议义务与资产；信托有分配决议、年度数据和两名个人受益人分配；两个个人有年度底稿、信托分配、供款到账与抵扣意向通知两个独立任务；牌照义务有窗口、周年日和 21 天注销提示。页面截图：

- [dashboard-agreement-obligation.png](./dashboard-agreement-obligation.png)
- [annual-six-entities.png](./annual-six-entities.png)
- [div7a-risk-and-schedule.png](./div7a-risk-and-schedule.png)
- [assets-depreciation-cross-year.png](./assets-depreciation-cross-year.png)

### C3. 一致性断言

#### BAS 与年度收入（不含 GST）

本轮使用的是“BAS G1 合计 − BAS 1A 合计”，不是错误的“G1 直接等于年度收入”。

| 公司 | BAS G1 合计 | BAS 1A 合计 | G1 − 1A | 年度收入 | 差额 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Boyun | 1,850,000 分 | 100,000 分 | 1,750,000 分 | 1,750,000 分 | 0 |
| Yeeliving | 3,700,000 分 | 200,000 分 | 3,500,000 分 | 3,500,000 分 | 0 |
| Neighbourhood | 0 分 | 0 分 | 0 分 | 0 分 | 0 |

GST_FREE_INCOME 与 INPUT_TAXED 进入 G1 和年度收入；NOT_A_SUPPLY 两边都不进入。原始交易 SQL 口径见 [sql-annual-reconciliation.txt](./sql-annual-reconciliation.txt)，应用对账见 [annual-reconciliation.json](./annual-reconciliation.json)。年度页提供逐 GST 代码构成与确认审计，而非阻断式硬校验。

#### 信托分配与个人端

| 项目 | 金额 |
| --- | ---: |
| 信托可分配收入 | 250,000 分 |
| `self` 分配 | 125,000 分 |
| `spouse` 分配 | 125,000 分 |
| 分配合计 | 250,000 分 |
| 差额 | 0 |

信托 UI、个人 API 和 SQL 数据分别由 [annual-six-entities.png](./annual-six-entities.png)、[api-annual-self-fy2026-27.json](./api-annual-self-fy2026-27.json)、[sql-trust-distributions.txt](./sql-trust-distributions.txt) 交叉取得；完整数值见 [trust-distribution-cross-check.json](./trust-distribution-cross-check.json)。

#### 资产与 Div 7A

资产总折旧与账面余额本年减少额的三家公司差额均为 0，见 [assets-cross-check.json](./assets-cross-check.json)。

Div 7A FY2026–27：

| 贷款 | 期初余额 | 利息 | 实际还款 | 期末余额 | 恒等式差额 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 900,000 分 | 78,930 分 | 0 分 | 978,930 分 | 0 |
| 2 | 450,000 分 | 39,465 分 | 0 分 | 489,465 分 | 0 |
| 3 | 2,000,000 分 | 0 分（发放年度） | 0 分 | 2,000,000 分 | 0 |
| 4 | 500,000 分 | 0 分（发放年度） | 0 分 | 500,000 分 | 0 |

交叉证据为 [div7a-risk-and-schedule.png](./div7a-risk-and-schedule.png)、[api-div7a-fy2026-27.json](./api-div7a-fy2026-27.json)、[sql-div7a-loans.txt](./sql-div7a-loans.txt)、[div7a-cross-check.json](./div7a-cross-check.json)。

### C4. 备份还原

实际流程为：独立数据库导出 ZIP → 还原到临时目录数据库 → 对七组表逐行比较，并比较文件内容。

| 表 | 还原前 | 还原后 |
| --- | ---: | ---: |
| `entities` | 6 | 6 |
| `transactions` | 59 | 59 |
| `obligations` | 60 | 60 |
| `bas_worksheets` | 12 | 12 |
| `div7a_loans` | 4 | 4 |
| `assets` | 3 | 3 |
| `opening_balances` | 2 | 2 |

`diff` 退出码为 0，文件比较为 `true`。ZIP 中实际包含 `app.db`、`manifest.json`、`files/` 和 `files/gate8-proof.txt`。证据见 [backup-roundtrip.json](./backup-roundtrip.json)、[backup-diff.txt](./backup-diff.txt)、[backup-sql-before.txt](./backup-sql-before.txt)、[backup-sql-after.txt](./backup-sql-after.txt)、[backup-roundtrip.zip](./backup-roundtrip.zip)。

## D. 依赖升级

按限定范围逐个升级：

1. `drizzle-orm`：`0.44.7 → 0.45.2`；升级后全量单元测试 `36/36` 文件、`190/190` 用例通过。
2. `sharp`：`0.34.5 → 0.35.4`；升级后全量单元测试 `36/36` 文件、`190/190` 用例通过。

没有运行 `npm audit fix`；`postcss` 未作为本轮升级对象，仍由原有 devDependency 范围锁定。干净 clone 的 `npm ci` 报告 6 个漏洞（5 moderate、1 high），本轮未扩大范围处理。

## E. 干净 clone 与实际验证

干净 clone：`/tmp/tax-compliance-gate8-clone.TVibEP`。执行了 `npm ci`、`npm run db:migrate`、`npm run db:seed`、两轮全量 Vitest、lint、build，以及完整 Playwright 14 个 test declaration。

### E1. Vitest

- 第一次：36 个文件通过，190 个用例通过。
- 第二次：`npm test -- --run --sequence.shuffle`，35 个文件通过，189 个用例通过，1 个文件/1 个用例失败。
- 失败：`tests/unit/div7a-agreement.test.ts` 的 `keeps an unknown security type blocked instead of assuming a seven-year agreement`，创建贷款时发生 `FOREIGN KEY constraint failed`。
- 位置：`tests/setup.ts` 当前为整个 Vitest 进程设置单一 `testDatabaseDirectory/test.db`，随机顺序暴露了测试间数据库状态依赖。
- 处理：按本轮“发现只报告、不修复”要求未修改断言、测试顺序、串行化或业务逻辑。

这使随机顺序结果与首轮不一致，是高严重度测试可靠性发现。

### E2. lint 与 build

- `npm run lint`：退出码 0。
- `npm run build`：退出码 0；Next.js 15.5.24 生产构建完成。

### E3. Playwright 全套

Playwright 已实际运行，不列为“未执行”：

- 默认并行运行（6 workers，未注入 ingest token）：14 个声明中 3 passed、8 failed、3 did not run。失败既包含共享 E2E 数据状态，也包含未提供 `INGEST_TOKEN` 导致的 401。
- 清空并重新 seed 后，用 `INGEST_TOKEN=test-ingest-token`、1 worker 再跑完整 14 个声明：5 passed、7 failed、2 did not run。
- 可复现的产品/测试发现包括：`tests/e2e/final-regression.spec.ts` 报 `/div7a` 在 390px 窄屏横向溢出；`gate0-settings.spec.ts` 的“设置”非 exact locator 发生严格模式冲突；多个 Gate 测试之间共享持久化数据库，导致数据和预期计数互相影响。

因此，本轮没有把 Playwright 写成“全部通过”；它已运行，失败作为发现保留，未改动既有 Gate 证据。

## F. 自审

### F1. 反证法

| 结论 | 如果错误会观察到什么 | 实际观察 |
| --- | --- | --- |
| Q2 不套两周延期 | Q2 为 14 Mar 2027 或 14 Mar 2028 | SQL/API 分别为 01 Mar 2027、2028-02-28 statutory；没有延长公式 |
| 未配置 2028 假日不猜 effective_due | 2028 Q2–Q4 出现具体工作日 | FY2027–28 Q2–Q4 的 effective_due 全为 NULL |
| 重复展开幂等 | 第二次展开后义务数增加或出现重复 scope | 30 → 30；两财年 BAS 各 12 |
| s109R 不自动采信可疑还款 | 风险场景的 actual repayment 仍等于 recorded repayment | 100,000 分风险还款的 actual 为 0，页面显示警告 |
| 合并贷款只影响展示 | 同组总最低还款不等于各笔之和，或 scope 被覆盖 | 两笔 Boyun 贷款分组、合计 266,166 分，协议义务仍按 loan scope |
| GST 对账为正确口径 | G1 − 1A 与年度收入出现未解释差额 | 三家公司差额均为 0，逐 GST 代码构成也为 0 |
| 信托分配不被自动配平 | 125,000 + 125,000 与个人端或信托收入不一致 | 三处均为 250,000，个人各 125,000 |
| 账面减少与折旧不一致 | 至少一个资产的本年账面减少不等于总折旧 | 三家公司差额均为 0 |
| 备份还原有数据损失 | 七组表行数/内容不同或文件不一致 | diff 退出码 0，行数相同，文件比较为 true |
| 缺年度利率时回退旧值 | FY2027–28 仍出现利率金额 | 牌照/贷款页面显示“基准利率未配置”，无金额；见 [div7a-rate-missing-blocked.png](./div7a-rate-missing-blocked.png) |

### F2. UI / API / SQL 三处交叉

| 口径 | UI | API | SQL/持久化证据 | 结果 |
| --- | --- | --- | --- | --- |
| BAS 日期 | `dashboard-agreement-obligation.png` | `api-obligations-fy2026-27.json`、`api-obligations-fy2027-28.json` | `sql-bas-fy2026-27.txt`、`sql-obligations-two-fy.txt` | 一致 |
| 公司年度收入 | `annual-six-entities.png` | `api-annual-all-fy2026-27.json` | `sql-annual-reconciliation.txt` + BAS worksheet SQL | 一致 |
| 信托分配 | `annual-six-entities.png` | `api-annual-self-fy2026-27.json` | `sql-trust-distributions.txt` | 一致 |
| 资产折旧/账面减少 | `assets-depreciation-cross-year.png` | `api-assets-fy2026-27.json` | `sql-assets.txt` + `assets-cross-check.json` | 一致 |
| Div 7A 余额 | `div7a-risk-and-schedule.png` | `api-div7a-fy2026-27.json` | `sql-div7a-loans.txt` + `div7a-cross-check.json` | 一致 |

### F3. 截图目视检查

已逐张用图像查看工具检查 5 张 Gate 8 截图：

- Div 7A 截图能看到合并组、年度行、s109R 警告和缺口；
- 缺利率截图能看到“无法判断 / 基准利率未配置”，没有伪造金额；
- 看板截图能看到六个主体和独立协议义务卡；
- 年度截图同时有个人、信托、公司卡片及对应人工补充项；
- 资产截图能看到车辆/设备、五年行、总折旧、可抵扣额及车辆警告。

未发现空白截图或关键元素错位；截图路径均为本目录，不触及旧 Gate 目录。

### F4. 主动暴露的三处最没把握点与针对性验证

1. **财年自动滚动的真实时钟触发**：用显式 FY2027–28 展开、重复展开和 API 查询验证生成与幂等；没有实际等待墙上日期跨年，故仍列为未能验证。
2. **未配置假日后的既有义务重算**：验证了未配置时 `effective_due = NULL`，配置 2028 年后纯日期计算器能得到日期；没有验证设置页保存后是否自动刷新所有已持久化义务，列为未能验证。
3. **并行 E2E 的数据库隔离**：实际以默认并行和单 worker 各跑一遍；两者都暴露共享状态/既有测试假设，随机 Vitest 也暴露共享数据库，故将其作为高严重度发现而不是把失败归因成偶发。

## G. 发现清单（本轮只报告，不修复）

1. **高严重度：单元测试数据库仍为进程级共享数据库。** 随机顺序首轮 190/190、第二轮 189/190；`tests/setup.ts` 的单一 `test.db` 使 `div7a-agreement.test.ts` 产生外键失败。影响是测试结果不具备顺序独立性，可能掩盖或制造业务回归。
2. **中严重度：Playwright 全套未通过且存在共享状态。** 14 个声明已执行，但默认并行 3/14 通过；重置数据库后串行 5/14 通过。影响是浏览器回归不能作为 Gate 8 全通过证据。
3. **中严重度：`/div7a` 窄屏横向溢出。** 由 `tests/e2e/final-regression.spec.ts` 在 390px 实测发现；影响是移动窄屏可用性不满足现有回归断言。
4. **无法验证：真实墙上日期进入 FY2027–28 后的自动展开。** 代码路径和显式展开行为已验证，但本轮无法等待真实日期事件。
5. **无法验证：保存年度假日配置后，已持久化义务是否自动批量重算。** 配置函数与计算器行为已验证，设置后的既有数据库行刷新未做浏览器级实测。

## H. 未能验证项

本章节非空：

- 真实墙上日期从 FY2026–27 进入 FY2027–28 的自动触发；
- 已持久化义务在设置页录入 2028 假日后是否自动全部重算；
- 2028 年维州公众假日官方发布后的真实日期校准，本轮没有推定这些日期。

以上项目没有被伪装成通过，也没有创建 `gate-8` 标签。
