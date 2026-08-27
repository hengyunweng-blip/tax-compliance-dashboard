# Gate 4 资讯模块复提交（日期与主体配置筛选）

状态：等待 Gate 4 验收；Gate 5 未开始。

本次真实运行使用全新数据库 `./data/gate4-news-real-20260827-v4.db`，没有覆盖任何 Gate 0–3 证据文件。实际抓取时间为 2026-08-27 15:59:29（`Australia/Melbourne`）。

## 1. 真实来源运行结果

| source_id | 来源 | fetch_type | active | 入库条数 | last_error |
|---:|---|---|---:|---:|---|
| 1 | ATO 小企业资讯 | `html_listing_ato` | 1 | 100 | `NULL` |
| 2 | ASIC 公告 | `html_listing_asic` | 1 | 4 | `NULL` |
| 3 | Consumer Affairs Victoria 房产中介 | `html_listing_cav` | 1 | 10 | `NULL` |
| 4 | Treasury 政策发布 | `html_listing_treasury` | 0 | 0 | `NULL` |

ATO 使用真实的 [Small business newsroom 列表](https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom)，不是单篇固定指引页；CAV 使用真实的 [Buying and selling property 专题列表](https://www.consumer.vic.gov.au/latest-news?Keyword=%7B131B3520-4AFE-4D3B-8967-E1781F982526%7D)。Treasury 按前一轮决定保留配置但 `active = 0`，所以本次没有向它发起抓取；其状态为停用、无错误、无入库条目。

## 2. ATO `published_at` 根因与修复

根因是 ATO Coveo 结果中的 `raw.date` 是索引/内容更新类时间戳，不是单篇首发日。之前使用它会把一批旧文统一成 2026 年 6 月 3–4 日；例如「Tax time 2025 is nearly over」的官方文章页明确显示 Published 3 October 2025，但列表结果的 `raw.date` 是 2026 年 6 月。

现在的规则是：

- 列表结果只有在 `firstpublish = 1` 时才使用 `raw.dateupdated` 作为首发日期；不使用 `raw.date`。
- `firstpublish = 0` 的结果进入文章页，只接受文章页明确的 `Published` 标签；`Last updated` 不会被当成发布日期。
- 文章页也无法确认时，`published_at` 写 `NULL`，绝不回落到抓取时间、页面时间或批次时间。
- 刷新同一来源时按文章 URL 更新已有缓存行，旧的错误日期不会与修正后的条目并存。

实际 SQL 输出见 [news-ato-published-sql-v4.txt](./news-ato-published-sql-v4.txt)。关键结果：

- ATO 100 条中 `published_at IS NULL` 为 **38 条**，这些条目在页面的「日期未知」折叠区，不进入 90 天主列表。
- 「Tax time 2025 is nearly over」实际为 `2025-10-03`，不再是 `2026-06-04`。
- `published_at = '2026-06-04'` 实际为 0 条；非 NULL 日期的最高重复次数为 5，没有此前的 17 条同日异常。

单元测试新增并通过：

- 文章页有 `Published` 时取文章页真实日期。
- 列表缺少首发日期、文章页只有其他内容时保持 `NULL`，不继承当日。
- 同一批次的错误统一日期不会被批次时间填充。
- 修正同一 URL 的日期时更新原缓存行，不产生错误副本。

## 3. 基于当前主体配置的排除规则

系统设计明确当前六主体为无雇员/无工资、且不实现工资单与 STP。该配置以 `settings.news_exclude_irrelevant_topics = true` 持久化，设置页可关闭。默认排除词包括 `payroll`、`STP`、`Single Touch Payroll`、`Payday Super`、`SBSCH`、`super guarantee`、`fuel tax credit(s)`，并覆盖本次实跑中明显不适用的 Government Payments Program、waterproof bedding 和 sunscreen。

本次验证固定窗口为 90 天，起点 `2026-05-29`：

- 主列表：**9 条**。
- 「可能不适用」折叠区：**12 条**，不进入主列表，也不送入 AI 分析。
- 日期未知折叠区：**38 条**，不进入主列表。

主列表逐条命中词如下：

| 来源 | published_at | 标题 | 命中关键词 |
|---|---|---|---|
| ASIC 公告 | 2026-08-20 | Superannuation and whole-of-business retirement | `superannuation` |
| Consumer Affairs Victoria 房产中介 | 2026-07-24 | Melbourne’s inner north targeted in winter auction compliance checks | `estate agents`, `underquoting` |
| Consumer Affairs Victoria 房产中介 | 2026-07-18 | Estate agency and representatives accused of rampant underquoting | `estate agents`, `estate agency`, `underquoting` |
| Consumer Affairs Victoria 房产中介 | 2026-07-17 | Estate agency facing court and VCAT over alleged rental failures | `estate agents`, `estate agency`, `vcat` |
| Consumer Affairs Victoria 房产中介 | 2026-07-09 | Agencies fined following Renting Taskforce investigation | `estate agents`, `estate agencies`, `renting taskforce` |
| ATO 小企业资讯 | 2026-07-08 | Stronger action on over-claimed expenses and GST credits \| Australian Taxation Office | `gst` |
| Consumer Affairs Victoria 房产中介 | 2026-06-17 | Essendon agent convicted for mishandling client money | `estate agent`, `estate agents` |
| ATO 小企业资讯 | 2026-06-03 | Have your say on the future of GST – join the GST Stewardship Group! \| Australian Taxation Office | `gst` |
| Consumer Affairs Victoria 房产中介 | 2026-06-03 | Estate agent Mark Reuben sentenced for unlicensed trading | `estate agent`, `estate agents` |

排除区实际命中词包括：`payday super`、`government payments program`、`fuel tax credit`、`fuel tax credits`、`sbsch`、`super guarantee`、`payroll`、`stp`、`single touch payroll`。页面逐卡显示命中词/排除词，方便复核筛选器没有把“25/33 条全量”误当作主列表。

## 4. 浏览器证据

- [主列表截图](./gate4-final-news-main-v4db.png)：真实 v4 数据库，显示 9 条主列表、固定日期格式和每卡命中词。
- [排除区展开截图](./gate4-final-news-excluded-v4db.png)：显示 12 条可能不适用条目及实际排除词，包括 Payday Super、SBSCH、fuel tax credit、STP 等。
- [设置页截图](./gate4-final-settings-v4db.png)：显示 90 天窗口、已勾选的主体不适用主题排除，以及公司日期输入的固定 `DD/MM/YYYY` 占位符/格式提示，没有 `DD/MM/YDD/MM/YYYY` 重叠。

浏览器 DOM 断言：主列表标题为「近 90 天 · 9 条命中」；主列表不包含 Payday Super；排除区包含 fuel tax credit；设置页包含排除开关和 `格式：DD/MM/YYYY`，不包含重复日期字符串。

## 5. 回归结果

- `npm test -- --run`：25 个测试文件、**124 passed**。
- `tests/unit/news.test.ts`：16 项通过，覆盖 ATO 文章页日期、NULL 日期、缓存纠正、排除开关和排除词。
- `tests/unit/settings.test.ts`：7 项通过，覆盖排除开关持久化和设置 API 校验。
- `npm run lint`：通过。
- `npm run build`：通过。

本次只完成 Gate 4 资讯退回项的修复和证据重跑；没有开始 Gate 5，Div 7A 官方计算器基准测试仍按要求留待 Gate 5 开始前处理。
