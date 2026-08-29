# Gate 7 A–D 实施与全面走查报告

生成日期：2026-08-30（Australia/Melbourne）
范围：A · Div 7A 还款有效性与合并贷款；B · 轻量资产登记与折旧；C · 六主体、跨年度走查及备份还原；D · 干净 clone 回归与自审。

本报告不是 Gate 7 验收结论。发现项按要求只报告、不修复。除文档状态映射外，本轮没有修改 Gate 0–6 的证据文件，也没有创建 `gate-7` 标签；`gate-6` 仍指向 `49ead396e0ce869412a328284e992021f3c43c8c`。

## 证据索引

- 独立走查数据库：`docs/evidence/gate7/cross-year-evidence.db`
- 跨年度脚本输出：`docs/evidence/gate7/cross-year-output.json`
- BAS SQL 明细：`docs/evidence/gate7/sql-bas-worksheets.txt`
- 资产与交易 SQL：`docs/evidence/gate7/sql-assets.txt`、`docs/evidence/gate7/sql-transaction-categories.txt`
- Div 7A SQL/API：`docs/evidence/gate7/sql-ui-div7a.txt`、`docs/evidence/gate7/sql-ui-opening-balances.txt`、`docs/evidence/gate7/api-div7a-fy2026-27.json`
- 年度 API：`docs/evidence/gate7/api-annual-fy2026-27.json`
- 备份 ZIP：`docs/evidence/gate7/backup-roundtrip.zip`
- UI 截图：`div7a-schedule-risk.png`、`div7a-agreement-obligation.png`、`div7a-rate-missing.png`、`assets-depreciation.png`、`annual-six-entities.png`

## A · Div 7A 补强

### A1 · s109R 风险提示

ATO 官方资料在 2026-08-30 核对：

- [ATO 关于 s109R / TD 2025/5 的官方说明](https://www.ato.gov.au/api/public/content/0-4f686e44-3c3f-424f-b3b9-7b8455aefd47)：指出在同一 private company 前后取得相似或更大金额的贷款时，部分或全部还款/最低还款可能被 s109R 忽略。
- [ITAA 1936 官方现行文本](https://www.legislation.gov.au/Details/C2022C00359)：核对法条上下文。

实现是风险筛查，不是法律结论：同一贷款方公司、同一借款人、还款日前后可配置窗口内，若出现金额相当或更大的公司支出或新增贷款，则在该所得年度显示「还款有效性存疑 · 请核对 s109R」。默认窗口为 30 个日历日；这是内部审查窗口，不是 ATO 的法定安全港。窗口可在设置中改为 1–365 天，默认依据已写在 `lib/domain/div7a/constants.ts`。

风险笔不自动计入最低还款。用户必须选择「已核对无重借」或「确认不计入」，选择写入 `audit_log`；在未核对状态下，展示的 `recordedRepaymentCents` 与计入最低还款的 `actualRepaymentCents` 分开。

实测：`tests/unit/div7a-repayment-validity.test.ts` 的 3 个用例全部通过。

- 30 Jun 还款 + 1 Jul 同额公司支出：触发风险，实际计入额为 0。
- 只有还款、没有后续支出/新增贷款：不触发风险。
- 用户确认后：还款计入，并产生一条审计记录。

截图 `div7a-schedule-risk.png` 实际显示了 30 Jun 2027 还款、1 Jul 2027 相关支出、风险警告和人工选择按钮。

### A2 · 合并贷款

ATO 资料在 2026-08-30 核对：[ATO 关于 amalgamated loans 的官方资料](https://www.ato.gov.au/api/public/content/0-df9bf50b-461c-4f07-b86b-f6fe8b2cc89a)。实现按贷款方、借款人、原始所得年度和相同最高期限分组；同组页面显示合计最低还款。未知担保类型不会被强行归入七年组。

协议义务仍逐笔保留，`scope_key` 使用 `loan:<loanId>`，没有因 UI 合并而覆盖数据库义务。`tests/unit/div7a-amalgamated.test.ts` 的 2 个用例全部通过；Div 7A 页面截图显示 Boyun 同一借款人的 FY2025–26、7 年组及合计最低还款 `$23,659.16`。

## B · 轻量资产登记与折旧

实现位置：`drizzle/0008_assets.sql`、`lib/domain/assets/formula.ts`、`lib/domain/assets/service.ts`、`app/assets/page.tsx`。

已实际覆盖：

- 资产名称、主体、购置日、可使用日、GST 不含成本、手动有效年限、`prime_cost` / `diminishing_value`、私人使用比例、处置日/处置金额。
- 30 Jun 2026 期初累计折旧和账面余额；旧资产缺期初值时返回 `manual_review`，不假设为零。
- 首年和处置年按天数比例；账面余额按总折旧减少，私人比例只影响可抵扣折旧。
- 年度底稿同时显示总折旧额和私人使用调整后的可抵扣额，均标注「不含 GST」；车辆只显示尚未评估 FBT/Div 7A 后果的提示并链接事实清单，不实现 FBT 计算。

`tests/unit/assets.test.ts` 的 6 个用例全部通过，覆盖 prime cost 五年序列、diminishing value 五年序列、首年按日比例、私人使用调整、期初余额接续、处置年比例和未配置时不产生金额。资产截图 `assets-depreciation.png` 显示三家公司三张资产卡和五年表格；其中车辆卡有事实清单链接与未评估提示。

## C · 六主体、跨年度走查

### C1 · 财年滚动检查——高危发现

实际调用：

```text
ensureObligationsForFy("2027-28")
=> Error: Unsupported annual tax financial year: 2027-28
```

依据位置：

- `lib/domain/obligations/calculator.ts:16-23` 的 BAS 日期表只有 `2026-27`。
- `lib/domain/obligations/calculator.ts:58-60` 对非 `2026-27` 年度直接抛出异常。
- `lib/domain/obligations/expand.ts:29-34` 的 BAS 期间也是固定到 2026–27。

这是 **高危发现**：系统进入 2027-07-01 后不能自动展开 FY2027–28 义务，若看板只依赖该展开，新的 BAS/年度提醒可能为空。年度模块本身的 FY2027–28 探针可以返回零收入和资产折旧，但义务模块不能生成义务。建议后续由用户决定是否改为参数化财年规则、按财年生成期间并加跨年边界测试；本轮不修复。

### C2 · 走查数据与流程覆盖

独立证据库实际行数：

| 表 | 行数 |
| --- | ---: |
| `entities` | 6 |
| `transactions` | 42 |
| `obligations` | 31 |
| `bas_worksheets` | 12 |
| `div7a_loans` | 4 |
| `assets` | 3 |
| `opening_balances` | 0 |

三家公司各有四季、每季 3 笔收入和 2 笔支出；Boyun 与 Yeeliving 各 20 笔，Neighbourhood 为 nil BAS。交易类别实际在 `sql-transaction-categories.txt` 中可见，包含 `GST_INCOME`、`GST_FREE_INCOME`、`GST_EXPENSE`、`GST_CAPITAL`、`NO_GST`。

FY2026–27 流程结果：

- 三家公司四份 BAS 均生成并转为 `paid`；Neighbourhood 四份为 0 的 nil BAS。
- 三家公司公司税表、ASIC 年检均走到 `paid`。
- 四笔 Div 7A 协议义务均单独存在且为 `blocked`，因为演练没有伪造书面协议、文件和条款核对资料；这是安全阻断，不是把贷款默认为合规。
- 信托年度底稿和 30 Jun 分配决议存在；两个拟议个人分配各 125,000 分。
- 两个个人年度底稿、供款到账和抵扣意向通知均分别存在；牌照年度声明也存在并走到 `paid`。
- FY2027–28 年度模块探针运行成功，但义务展开被 C1 阻断。

### C3 · 一致性断言与发现

#### 公司 BAS 与年度收入

`sql-bas-worksheets.txt` 是四季实际 SQL；年度金额来自同一证据库的 `buildCompanyTaxWorksheet`，并由 `api-annual-fy2026-27.json` 复核。单位均为分。

| 公司 | Q1 G1/1A | Q2 G1/1A | Q3 G1/1A | Q4 G1/1A | 四季 G1 | 四季 1A | G1−1A | 年度收入 | 差额 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boyun | 160,000 / 10,000 | 320,000 / 20,000 | 480,000 / 30,000 | 640,000 / 40,000 | 1,600,000 | 100,000 | 1,500,000 | 1,750,000 | -250,000 |
| Yeeliving | 320,000 / 20,000 | 640,000 / 40,000 | 960,000 / 60,000 | 1,280,000 / 80,000 | 3,200,000 | 200,000 | 3,000,000 | 3,500,000 | -500,000 |
| Neighbourhood | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 | 0 | 0 | 0 | 0 |

**发现，高严重度：** 两家公司不满足 C3 要求的 `四份 BAS G1 合计 − 1A 合计 = 年度收入`。差额分别为 250,000 分和 500,000 分，恰好是被年度收入计入、但当前 BAS 映射排除的 `NO_GST` 收入。演练把这些 `NO_GST` 行放在收入科目，因此差额需要业务口径决定：若它们是真实销售，BAS G1/年度口径需要重新核对；若不是销售，交易科目分类需要重新核对。本轮只报告，不改映射或演练数据。

#### 信托与个人分配

| 检查 | 实际值（分） | 结果 |
| --- | ---: | --- |
| 信托可分配收入 | 250,000 | — |
| self 拟议分配 + spouse 拟议分配 | 125,000 + 125,000 = 250,000 | 差额 0 |
| self 年度底稿信托分配 | 0 | 与信托端 125,000 不一致 |
| spouse 年度底稿信托分配 | 0 | 与信托端 125,000 不一致 |

**发现，中严重度：** 演练中的分配只写入信托侧 `audit_log`，没有进入两个个人年度底稿；个人页面/API 显示 0。系统因此不能自动完成“信托端记录 = 个人端年度底稿”的一致性断言。本轮不补写分配存储路径。

#### 资产与账面余额

| 资产 | 本年总折旧 | 账面余额减少 | 差额 |
| --- | ---: | ---: | ---: |
| Boyun vehicle | 200,000 | 200,000 | 0 |
| Yeeliving equipment | 800,000 | 800,000 | 0 |
| Neighbourhood equipment | 100,000 | 100,000 | 0 |

资产一致性通过；原始资产字段在 `sql-assets.txt`，年度 API 在 `api-annual-fy2026-27.json`，UI 在 `assets-depreciation.png`。

#### Div 7A 余额

四笔演练贷款都在发放年度 FY2026–27，未记录还款；发放年度不计利息/最低还款，所以每笔均为 `期初 + 利息 − 实际还款 = 期末`，差额 0。这个跨模块样本没有覆盖有期初余额的连续滚动；连续滚动由 A/B 单元测试及下方独立期初余额表覆盖。

### C4 · 备份还原

实际导出的 ZIP：`docs/evidence/gate7/backup-roundtrip.zip`，SHA-256：

```text
8fa89ccecb290365694f66a101ff2ad0d93cfa4c59c9c65ec6ad156700e2e747
```

`unzip -t` 实际结果为 `No errors detected in compressed data`。归档包含 `app.db`、`manifest.json`、`files/` 和演练文件。还原使用 `restoreBackupArchive` 到新的临时数据库，SQL 快照在 `backup-before/`、`backup-after/`，汇总在 `sql-backup-diff.txt`：

| 表 | 还原前 | 还原后 | diff exit code |
| --- | ---: | ---: | ---: |
| `entities` | 6 | 6 | 0 |
| `transactions` | 42 | 42 | 0 |
| `obligations` | 31 | 31 | 0 |
| `bas_worksheets` | 12 | 12 | 0 |
| `div7a_loans` | 4 | 4 | 0 |
| `assets` | 3 | 3 | 0 |
| `opening_balances` | 0 | 0 | 0 |

七张表的前后 SHA-256 完全相同，`allDiffExitCode = 0`，还原文件存在。

## A/B 的 Div 7A 逐年表与截图

为满足“带期初余额、从 FY2026–27 到期”的完整输出，单独建立了一个证据数据库：贷款原始所得年度 FY2019–20、原始期限 7 年、30 Jun 2026 期初余额 10,000,000 分，FY2026–27 适用已录入的 8.77%。完整 JSON 在 `div7a-opening-schedule.json`，对应 SQL 在 `sql-opening-loan-schedule.txt`：

| 所得年度 | 状态 | 期初余额 | 利息 | 最低还款 | 实际还款 | 期末余额 | 剩余年限 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FY2026–27 | active | 10,000,000 | 877,000 | 10,877,000 | 0 | 10,877,000 | 1 |
| FY2027–28 | expired | 10,877,000 | 0 | 0 | 0 | 10,877,000 | 0 |

第二行显示未清偿余额和人工核对警告，没有静默结束。注意：它是专门为期初余额/到期边界设计的证据样本，不是把未来年度利率外推到系统配置中。

截图逐张检查结果：

- `div7a-schedule-risk.png`：可见 Gate 7 Div 7A 页面、合并组、利率来源、期初/利息/最低/实际/期末、s109R 警告和完整年度表；日期均为 `DD MMM YYYY`。
- `div7a-agreement-obligation.png`：可见独立贷款协议义务、截止日、lodgement day、利率和未补齐协议资料导致的待配置状态。
- `div7a-rate-missing.png`：可见缺年度利率时金额全部为“无法判断”，没有回退到旧贷款利率。
- `assets-depreciation.png`：可见资产录入区、三张资产卡、两种折旧方法和逐年折旧表。
- `annual-six-entities.png`：可见个人、信托和三家公司六张年度底稿卡；个人没有 franking/FTE 清单项，信托有 FTE，公司有 franking account 和 Div 7A 借款余额。

截图内容可读，主体卡片和表格没有空白错位的关键元素；全页截图在底部有浏览器全页拼接重复尾部，但不影响上述内容核对。

## D · 干净 clone 回归基线

clone 目录：`/tmp/tax-gate7-clean.mdzhgk`。只使用仓库内容执行：

```text
git clone --no-local /Users/neilweng/Documents/ChatGPT/税务任务开发 /tmp/tax-gate7-clean.mdzhgk
npm ci
npm run db:migrate
npm run db:seed
```

默认数据库路径为该 clone 内的 `./data/app.db`。`npm ci` 成功，未执行 `npm audit fix`。

### 测试

普通顺序：

```text
npm test -- --run --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=verbose
Test Files  35 passed (35)
Tests       180 passed (180)
```

随机顺序，Vitest seed `1788015921167`：

```text
npm test -- --run --pool=forks --maxWorkers=1 --minWorkers=1 --sequence.shuffle --reporter=verbose
Test Files  35 passed (35)
Tests       180 passed (180)
```

两轮结果一致。相对旧 `HANDOVER.md` 的 29 文件/149 用例，以及原审计目标中提到的 29 文件/143 用例，当前真实基线为 **35 个文件 / 180 个用例，全部通过**；没有为了匹配旧数字修改断言。

### lint/build

- `npm run lint`：通过，退出码 0。
- `npm run build`：失败，退出码 1。Next 编译和页面编译成功，在类型检查阶段失败：`scripts/gate7-cross-year-audit.ts:248` 返回 `{ entityId, ...row }`，其中 `row` 自带 `entityId`，TypeScript 报 “entityId is specified more than once”。这是本轮新增的构建发现，按“发现只报告不修复”处理。

本轮未重新运行 Playwright runner；仓库中仍有 9 个 e2e 文件、14 个 `test` 声明，因此 e2e 的本轮全量运行状态列入“未能验证项”，不以声明数量代替运行通过。

### 依赖漏洞（只记录）

clean clone 的 `npm audit --json` 报告 3 个 high；本轮没有执行修复：

| 包 | high 项 | 依赖性质 |
| --- | --- | --- |
| `drizzle-orm` | SQL injection via improperly escaped SQL identifiers | 运行时直接依赖 |
| `postcss` | XSS / source map 文件读取相关问题 | 开发依赖（`package.json` 的 devDependency） |
| `sharp` | libvips 相关 CVE | 运行时直接依赖 |

## 自审

### 1. 反证法

| 结论 | 如果结论是错的，应观察到什么 | 实际观察 |
| --- | --- | --- |
| s109R 提示按风险而非自动判定 | 同额后续支出没有提示，或未核对还款仍被计入最低还款 | 单元测试触发提示；UI 显示 recorded 与 actual 分开；未核对 actual 为 0 |
| 合并贷款按同借款人/年度/最高期限分组 | 相同组被拆开，或不同借款人/担保类型被错误合并 | 2 个单元测试通过，UI 显示 Boyun 两笔合并组 |
| 资产账面余额按总折旧减少 | 私人使用比例改变账面余额，或缺期初值仍产生折旧金额 | 6 个资产测试通过；API、SQL、截图的本年折旧/账面减少一致；缺值为 `manual_review` |
| 备份还原无数据差异 | 任一七张表行数或 hash 变化，或 ZIP 无法解压 | `unzip -t` 无错误；7 个 diff code 均 0；hash 全相同 |
| 测试隔离没有跨文件依赖 | 普通/随机顺序的测试数量或通过数不同 | 两轮均 35/180 通过，随机 seed 结果一致 |

C1、公司 BAS/年度差额、个人分配差额及 build 失败没有写成“符合”，而是明确列为发现。

### 2. UI/API/SQL 三处交叉

| 对象 | UI | API | SQL | 交叉结果 |
| --- | --- | --- | --- | --- |
| Div 7A 活跃贷款 1 | `div7a-schedule-risk.png`：期初 $100,000、利息 $8,770、最低 $19,715.97、期末 $108,770、30 Jun 2027 | `api-div7a-fy2026-27.json`：10,000,000 / 877,000 / 1,971,597 / 10,877,000 分 | `sql-ui-div7a.txt` 与 `sql-ui-opening-balances.txt`：贷款 1、FY2025–26、10,000,000 分、30 Jun 2026 期初 | 一致 |
| 资产 | `assets-depreciation.png`：三资产逐年表 | `api-assets-fy2026-27.json`：资产 1/3/2 折旧 200,000/100,000/800,000 分 | `sql-ui-assets.txt`：成本、方法、私人比例与主体一致 | 一致 |
| Boyun 年度口径 | `annual-six-entities.png`：收入 $17,500、不含 GST | `api-annual-fy2026-27.json`：`incomeCents=1,750,000`、`amountBasis=GST-exclusive` | `sql-bas-worksheets.txt`：四季 G1=1,600,000、1A=100,000，净额=1,500,000 | UI/API 一致；与 BAS SQL 的 250,000 分差额已列为发现 |
| 期初余额到期样本 | `div7a-schedule-risk.png`/独立逐年 JSON 显示 active/expired 样式 | `div7a-opening-schedule.json` 为完整逐年计算结果 | `sql-opening-loan-schedule.txt` 记录贷款原始年度、期限、30 Jun 2026 余额和来源 | 一致 |

### 3. 主动暴露的三处最没把握点及针对性检查

1. **财年 rollover**：之前没有真实探测过新年度。现在直接调用 `ensureObligationsForFy("2027-28")`，实际抛出 unsupported 年度异常；已列为 C1 高危发现。
2. **NO_GST 收入与 BAS G1 的边界**：之前的演练断言过于简单。现在把每季类别、BAS SQL 和年度 API 对齐，发现两家公司分别差 250,000/500,000 分；已列为高严重度口径发现。
3. **信托分配跨个人底稿的持久化**：之前只看信托端分配总额。现在同时读取信托审计记录、个人 API/UI，确认两个人仍为 0 而信托端各 125,000；已列为中严重度发现。

### 4. 未能验证项

- FY2027–28 真实义务自动展开无法验证为“通过”，因为当前代码在探针处抛出 C1 异常；实际生产跨年看板状态尚未验证。
- 本轮没有重新运行 Playwright e2e 全套，也没有把 14 个声明当成通过。
- 没有使用真实 ATO/ASIC 账户执行登录后的生产申报；本系统仍不向 ATO/ASIC 自动提交。
- 真实手机相机拍照上传不在本轮验证范围；本轮只检查了桌面浏览器 UI 截图和已实现的响应式结构。

## 发现清单（本轮不修复）

| 编号 | 现象 | 影响 | 位置 | 严重程度 |
| --- | --- | --- | --- | --- |
| F-G7-01 | FY2027–28 义务展开抛出 `Unsupported annual tax financial year` | 新财年 BAS、年度义务和提醒可能全部缺失 | `lib/domain/obligations/calculator.ts:16-23,58-60`；`lib/domain/obligations/expand.ts:29-34` | 高危 |
| F-G7-02 | Boyun/Yeeliving 的 G1−1A 分别比年度收入少 250,000/500,000 分 | 可能漏掉 NO_GST 销售，或将非销售错误记入收入；年度与 BAS 口径不一致 | `lib/domain/bas/gst-mapping.ts`、`lib/domain/annual/company.ts`；走查 SQL/API | 高危 |
| F-G7-03 | 信托拟议分配只在信托审计记录，个人年度底稿仍为 0 | 个人申报底稿无法追溯信托分配，跨主体金额不一致 | `lib/domain/annual/personal.ts` 及走查分配写入路径 | 中 |
| F-G7-04 | `npm run build` 在审计脚本第 248 行类型检查失败 | clean clone 不能通过生产构建 | `scripts/gate7-cross-year-audit.ts:248` | 高 |
