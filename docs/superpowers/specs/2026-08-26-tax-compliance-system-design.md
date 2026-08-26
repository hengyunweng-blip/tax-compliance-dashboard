# 澳洲多主体税务合规看板系统设计

**状态：** Gate 0、Gate 1 已验收通过；Gate 2 修订已完成，准备合并并进入 Gate 3

**需求来源：** `/Users/neilweng/Downloads/tax-compliance-system-spec.md`

**用户请求与附件的关系：** 用户要求“以 md 文件的需求完全执行开发”；附件是功能、技术和验收需求，用户在本轮补充的五项修正是更高优先级的实施约束。`【待填】`数据不阻塞开发，但在数据录入前必须保持 `blocked / 待配置`，不能隐藏相关义务。

## 1. 目标与边界

本系统是供单人在墨尔本本地使用的澳洲多主体税务合规看板。它从 FY2026–27 起管理 6 个纳税主体和 1 张地产牌照，提供本地账本、义务日期、提醒、BAS/年度底稿、录入分类、资讯提示和可追溯审计记录。

以下边界是硬约束：

- 不连接 ATO 或 ASIC 自动申报；系统只生成底稿和手动操作指引。
- 不保存 TFN；如需提示只允许保存最后三位的用户自填提示串。
- 不实现工资单、STP、Payday Super、多用户、权限系统、云端部署或信托账户管理。
- AI 输出始终是建议，不能未经确认修改交易、义务、金额或申报状态。
- 本地 SQLite 和 `./data/files/` 是数据源；除 AI API 与资讯抓取外不主动出网。
- 每个 Gate 完成后立即停止，等待用户验收；未经用户明确验收，不进入下一 Gate。

## 2. 五项实施修正

### 2.1 严格 Gate 停止

实施计划按 Gate 0–5 拆分。每个 Gate 都包含独立的测试、运行检查和验收清单。完成清单后只报告结果，不执行下一 Gate 的代码、迁移、种子或 UI 工作。用户明确回复该 Gate 验收通过后，才可继续。

Gate 1 的验收重点是日期：必须同时保留 `statutory_due`（需求表列出的法定日）和 `effective_due`（周末/公众假日调整后的实际工作日），UI 默认显示实际日并可展开查看法定日。这样既能逐条核对需求文档原表，又能验证调整规则。

### 2.2 IANA 时区

全系统唯一业务时区常量为：

```ts
export const MELBOURNE_TIME_ZONE = "Australia/Melbourne" as const;
```

日期计算使用 `date-fns` 与 `date-fns-tz`，禁止用固定 `UTC+10`、`Etc/GMT-10` 或把 UTC 日期直接当成本地日期比较。义务日期在数据库中保存为 `YYYY-MM-DD` 的本地日历日期；带时间的审计、上传和抓取时间在呈现及日历生成时转换到 `Australia/Melbourne`。任何倒数天数先取得墨尔本本地日期，再使用日期字符串计算。

### 2.3 三个补充入口/模型约束

1. 邮箱转发入口必须为 `POST /api/ingest/email`，接受 `multipart/form-data` 和 JSON base64 附件。请求必须使用 `.env.local` 的 `INGEST_TOKEN` 共享密钥校验；无效或缺失密钥不得写入文件或数据库。
2. 所有金额字段均为整数分：数据库列使用整数，服务层类型使用 `number`/`bigint` 的安全整数校验，金额解析从字符串精确转换，禁止用浮点数表示金额或用浮点累加。利率是非金额参数，可用 Decimal 参与 Div 7A 计算，但最终结果必须四舍五入为整数分。
3. 必须有 `audit_log` 和 `ai_cache`。所有义务状态变更在同一事务内写审计记录；AI 的脱敏输入使用规范化 JSON 的 SHA-256 做持久化缓存键，缓存结果可跨进程复用。

### 2.4 三块强制单元测试

以下测试先写失败测试，再实现，且在对应 Gate 的验收报告中单独列出：

- 义务日期：周末、维州公众假日顺延，以及 Q2 BAS 不增加两周延期。
- GST 代码到 BAS 标签：G1、1A、1B、G10、G11 的正负号、私人项和无 GST 项。
- Div 7A：本金、基准利率、剩余年限、最低年度还款额和整数分舍入。

### 2.5 浏览器验证边界

自动化验证包含桌面流程和窄屏响应式布局检查；不声称验证真实手机摄像头、真实手机拍照权限或手机系统上传流程。Gate 2 报告会明确写出：窄屏布局已检查，真实手机拍照由用户现场验收。

## 3. 方案选择

### 方案 A：Next.js 本地单体应用（采用）

使用 Next.js 15 App Router、Route Handlers、Drizzle ORM 和 better-sqlite3，在一个 Node 进程中提供页面和本地 API。业务计算放进 `lib/domain`，数据库访问放进 `lib/db`，页面只调用服务接口。

优点是符合需求给定技术栈，文件路径、备份、上传和 SQLite 事务简单，离线降级自然；缺点是未来若需要多人或云端部署，需要另行拆分服务。当前非目标明确不做多人和云端，所以这是最小且可验证的方案。

### 方案 B：Next.js 前端 + 独立 API 服务

可以提前拆出后端，但会增加本地启动、跨进程数据库锁、部署和测试复杂度，当前需求没有独立服务消费者，不采用。

### 方案 C：浏览器本地数据库

可减少服务端配置，但无法稳定满足 `./data/app.db`、附件目录、邮箱接口、备份 zip 和 AI/资讯后台抓取要求，不采用。

## 4. 系统架构

```text
Next.js App Router
├── app/                  页面与 Route Handlers
├── components/           看板、表单、表格、底稿、响应式组件
├── lib/db/               Drizzle schema、迁移、事务和 seed
├── lib/domain/           义务、BAS、年度、Div 7A、养老金业务规则
├── lib/ingest/           文件、邮箱、CSV、手动录入和分类队列
├── lib/ai/               脱敏、缓存、适配器和规则降级
├── lib/news/             抓取、缓存、预筛和分析
├── lib/time/             Australia/Melbourne 日期工具
└── data/                 app.db、files/、备份临时输出
```

### 4.1 数据访问与事务

- `lib/db/client.ts` 创建单例 better-sqlite3 连接，并启用 foreign keys、WAL 和 busy timeout。
- `lib/db/schema.ts` 是唯一 schema 来源；迁移由 Drizzle Kit 生成并可在本地重放。
- 所有写服务接收已校验的 domain input，不允许页面直接写 Drizzle 表。
- `generateBasWorksheet()` 使用一个 SQLite transaction 完成校验、汇总、快照、worksheet 写入和交易锁定；任何一步失败全部回滚。
- `transitionObligation()` 使用一个 transaction 同时变更状态和写入 `audit_log`。

### 4.2 数据表

实现附件中列出的 `entities`、`licences`、`accounts`、`transactions`、`documents`、`obligation_rules`、`obligations`、`reminders`、`bas_worksheets`、`div7a_loans`、`super_contributions`、`news_sources`、`news_items`、`news_analyses`、`settings`，并补上：

- `audit_log`：`id`、`target_type`、`target_id`、`from_status`、`to_status`、`reason`、`metadata_json`、`changed_at`。
- `ai_cache`：`id`、`method`、`input_sha256`、`redacted_input_json`、`output_json`、`model_used`、`created_at`。`(method, input_sha256)` 唯一，缓存中不保存未脱敏原文。
- `csv_mapping_templates`：银行标识、列映射 JSON、最近使用时间。

所有表都有 `created_at` / `updated_at`，SQLite 布尔值在 domain 层映射为 boolean。金额列包括 `amount_cents`、`gst_cents`、BAS 标签、Div 7A 本金/还款、供款和上限，均为整数。

`obligations` 额外保存 `income_year`（所属所得年度）和 `deadline_fy`（`effective_due` 所在财年）。配置缺失而必须保留义务卡片时，`statutory_due` 与 `effective_due` 可为空，状态必须为 `blocked`。`obligation_rules.adjustment_direction` 为 `forward`（默认）或 `backward`，`required_fields` 保存该规则自己的配置依赖字段 JSON。`blocked` 只由当前规则声明的依赖字段缺失触发，不能从主体级别扩散到其他义务；BAS 与公司税表的 `required_fields` 均为空。`bas_worksheets` 保留 `payg_instalment_cents`，为整数分且可空；它只能由用户根据 ATO 预填的 5A/5B 数字手动录入，系统不得自行推算。

### 4.3 主体种子

系统首次 seed 六个固定 ID：`self`、`spouse`、`boyun_trust`、`boyun_co`、`yeeliving_co`、`neighbourhood_co`。三家公司初始 `gst_registered = true`，其中 `neighbourhood_co` 也生成正常 BAS 义务。公司 ACN/ASIC 周年日和唯一 `self` 持有牌照的周年日为空时，只有对应的适用义务可以是 `blocked / 待配置`；个人和信托不因缺少公司字段而进入 blocked。

### 4.4 Gate 0 配置页边界

- 主体配置表固定展示上述两个个人、一个信托和三家公司；按 `entities.type` 渲染字段。公司显示 ACN、ASIC 周年日和 GST 注册选择，个人/信托这三项显示“不适用”，不渲染输入控件，也不显示“待配置”。
- 主体状态只对公司检查 ACN 与 ASIC 周年日；个人和信托的缺失公司字段始终是 `ready`，不能污染义务 blocked 状态。
- 牌照只有一张，由 `self` 持有；牌照号码与牌照周年日仅出现在独立的“牌照配置”标签页，主体表不出现牌照列。
- 系统是本地单用户工作台，不提供主体切换下拉、工作区选择、“私人工作区”页脚或多租户壳子。

## 5. 时间、假日和到期日设计

### 5.1 到期日数据模型

每条 obligation 同时存储：

- `income_year`：该义务所属的所得年度，例如 2026-10-31 的信托/个人税表属于 FY2025-26。
- `deadline_fy`：截止日所在财年，例如 2026-10-31 属于 FY2026-27；它不替代 `income_year`。
- `statutory_due`：规则表或需求表列出的原始日期。
- `effective_due`：按墨尔本工作日规则顺延后的日期。

`period_start` 与 `period_end` 也使用本地 `YYYY-MM-DD`。日期展示统一 `DD MMM YYYY`，由 `formatDueDate()` 输出固定英文月份缩写，不读取浏览器或服务器 locale。日期输入不使用原生 `type="date"`，统一使用显式 `DD/MM/YYYY` 文本控件并在字段内标明格式；保存前解析为 Melbourne 本地 `DateOnly`，存储仍为 `YYYY-MM-DD`。因此同一份应用在 `en-US` 或其他机器区域设置下不会改变日期顺序。

卡片和底稿标题显示 `income_year` 与法定日，例如「FY2025–26 信托税表 · 截止 31 Oct 2026」。卡片详情另外显示「实际工作日：02 Nov 2026」并以 `effective_due` 计算倒数；这样标题保留原规则日，操作提醒仍使用实际工作日。

### 5.2 FY2026–27 BAS 必须断言的结果

对三家 GST 注册公司各生成四条 BAS：

| 期间 | income_year | statutory_due | effective_due | 规则 |
|---|---|---:|---:|---|
| Q1 | FY2026–27 | 28 Oct 2026 | 11 Nov 2026 | 网上自办额外 14 天 |
| Q2 | FY2026–27 | 28 Feb 2027 | 01 Mar 2027 | 周日顺延；没有两周延期 |
| Q3 | FY2026–27 | 28 Apr 2027 | 12 May 2027 | 网上自办额外 14 天 |
| Q4 | FY2026–27 | 28 Jul 2027 | 11 Aug 2027 | 网上自办额外 14 天 |

这里的 Q2 断言必须防止通用“季度加 14 天”代码误套用。需求表中的 Q2 法定日仍是 2027-02-28；实际日是 2027-03-01。

### 5.2a 非统一顺延方向与牌照窗口

- `forward` 用于 BAS、公司/信托/个人税表和 ASIC 年检，非工作日调整到下一个工作日。
- `backward` 用于个人可抵扣供款到账、信托分配决议和牌照年度声明，非工作日调整到上一个工作日。2029-06-30 为周六时，实际日为 2029-06-29，不能推入下一财年。
- 牌照周年日是截止日，不是窗口开启日。周年日 `15 Aug 2026` 时，`windowOpens = 04 Jul 2026`、`statutory_due = 15 Aug 2026`、`effective_due = 14 Aug 2026`。卡片同时显示窗口开启日和周年日，只有周年日带“截止”字样；提醒从窗口开启日开始。
- 牌照详情页明确显示：周年日后 21 天仍未完成年度声明将自动注销，示例注销后果日期为 `05 Sep 2026`。逾期牌照卡片使用最高危险红色样式。

### 5.2b 未配置 ASIC 的安全行为

公司缺少 `asic_review_date` 时仍生成 ASIC 年检卡片，但状态为 `blocked`，`statutory_due` 与 `effective_due` 均为 `NULL`，UI 只显示“日期待配置”，禁止套用默认周年日。该 `blocked` 只作用于 ASIC 年检本身；同一公司不依赖 ASIC 日期的 BAS 与公司税表仍按完整日期生成并保持 `todo`。

### 5.3 所属年度与截止日所在财年

年度义务的 `income_year` 不按到期日推导：

- 2026-10-31 的 Boyun Trust 和两个人的税表：`income_year = FY2025-26`，`deadline_fy = FY2026-27`。
- 2027-02-28 的三家公司税表：`income_year = FY2025-26`，`deadline_fy = FY2026-27`；实际工作日为 2027-03-01。
- FY2026–27 BAS 的 `income_year = FY2026-27`，并统一填写 `deadline_fy = FY2026-27`。

看板、义务详情、BAS/年度底稿标题必须显示 `income_year`；截止日、实际工作日和倒数分开显示，不能只显示一个模糊的 FY 标签。

### 5.4 维州公众假日

`lib/holidays.ts` 硬编码 2026 和 2027 的维州公共假日，并附带“每年更新”注释。初始来源为 Business Victoria 的 2026、2027 官方页面：

- [Victorian public holidays 2026](https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026)
- [Victorian public holidays 2027](https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027)

- 2026：01-01、01-26、03-09、04-03、04-04、04-05、04-06、04-25、06-08、09-25、11-03、12-25、12-26、12-28。
- 2027：01-01、01-26、03-08、03-26、03-27、03-28、03-29、04-25、06-14、11-02、12-25、12-26、12-27、12-28；AFL Grand Final 前周五在官方页面仍标记为待赛程，代码不得擅自猜测，需在官方日期公布后更新常量。

日期调整函数只会把周六、周日或常量中的公众假日推到下一个工作日。假日数组是纯函数输入，便于测试。

## 6. 义务状态、提醒与审计

状态流为：

```text
blocked → todo → collecting → draft_ready → lodged → paid
```

`na` 是独立终态；回退必须携带原因。每条义务按其 `obligation_rules.required_fields` 独立判断是否 `blocked`，不按主体汇总状态。缺少 ACN、周年日或所需账本数据时，只影响声明依赖该字段的规则，不隐藏其他义务。`blocked` 义务不生成提醒；同一主体的其他可计算义务仍按自己的提醒偏移生成提醒。每次状态变更写 `audit_log`，包括来源页面/操作人标识、前后状态和原因。

默认提醒为 T-30、T-10、T-3、当天和逾期每日；信托分配决议为 T-60，牌照为窗口开启日，供款为 T-45。牌照逾期在 UI 使用最高危险样式。

`.ics` 导出为 `text/calendar`，每条 obligation 生成全天事件，使用 `effective_due`、墨尔本日期、主体、期间、portal URL 和状态说明；不把 UTC 时间转换成错误的前一天。

## 7. 录入、账本和 BAS

四种入口统一写入 `documents` 或 `transactions`：

1. 拍照/文件上传：去重、压缩、保存 sha256；AI 关闭时直接进入人工 Inbox。
2. `POST /api/ingest/email`：共享密钥校验后接收 multipart 或 base64，复用文档入库服务。
3. CSV：映射日期/描述/金额/余额，按银行保存模板；日期格式可选 `DD/MM/YYYY`（默认）、`YYYY-MM-DD`、`MM/DD/YYYY`，选择值随模板保存。预览区按所选格式解析并固定显示 `DD MMM YYYY`；全量导入前若解析失败或月份超过 12 则阻止导入并提示可能选错格式。重复键为“完整原始行（包含描述）的 SHA-256 + 解析后的日期 + 金额分”，同日同额但描述不同不视为重复，不静默删除。
4. 手动表单：金额字符串精确解析成分，支持复制上一条。

未确认主体、科目或 GST 代码的记录不能进入 BAS；生成底稿前显示待确认笔数。

GST 归位由纯函数实现并单测：

| GST code | BAS 标签 | 金额处理 |
|---|---|---|
| `GST_INCOME` | G1、1A | 销售总额进 G1，GST 进 1A |
| `GST_FREE_INCOME` | G1 | 销售总额进 G1，不进 1A |
| `INPUT_TAXED` | G1 | 销售总额进 G1，不进 1A |
| `GST_EXPENSE` | G11、1B | 支出绝对值进 G11，GST 绝对值进 1B |
| `GST_CAPITAL` | G10、1B | 支出绝对值进 G10，GST 绝对值进 1B |
| `NO_GST`、`PRIVATE` | 无 | 完全排除 |

三家公司营业额低于 $10m，按 Simpler BAS 处理。BAS 底稿的「操作指引卡」只能列出 G1、1A、1B；G10/G11 仍在内部汇总和 worksheet 中保存，并在 UI 明确标注「内部核算用，不填入 ATO 表单」。G10/G11 供年度模块区分资本与非资本采购，不得出现在指引卡的 ATO 填表步骤中。

`BasSummary` 明确区分三个值：

```ts
type BasSummary = {
  g1Cents: number;
  a1Cents: number;
  b1Cents: number;
  g10Cents: number; // 内部核算用
  g11Cents: number; // 内部核算用
  paygInstalmentCents: number | null; // 用户手动录入 ATO 预填 5A/5B
  gstNetCents: number; // a1Cents - b1Cents
  statementTotalCents: number | null; // 输入 PAYG 后为 gstNetCents + paygInstalmentCents
};
```

系统不得根据收入、利润或历史数据推算 PAYG instalment。`paygInstalmentCents` 未录入时，`statementTotalCents` 保持待录入状态；录入后才计算总额。已递交金额校验必须对比 `statementTotalCents`，不能只对比 `gstNetCents`。BAS 快照保存交易 ID，锁定纳入交易，nil BAS 仍生成全零底稿和仅包含 G1/1A/1B 的操作指引。

## 8. AI、资讯和脱敏

AI 配置从 `config/ai.json` 读取，密钥只从环境变量读取。四个适配方法统一经过：输入校验 → TFN/银行账号/完整地址脱敏 → canonical JSON → SHA-256 → `ai_cache` 查找 → 可选 provider 调用 → 结果缓存。

失败或关闭时：发票进入人工队列、交易使用关键词分类、资讯只显示来源信息、义务使用静态 checklist。任何 AI 结果都不会直接调用状态或金额写入服务。

资讯抓取启动后异步运行，24 小时缓存，单源错误写回 `news_sources.last_error`，不阻塞首屏。关键词预筛命中后才分析，页面必须显示来源、发布日期和原文链接。

## 9. 页面与验证

页面路由严格覆盖需求文档的 `/`、`/inbox`、`/entities/[id]`、`/obligations/[id]`、`/bas/[obligationId]`、`/annual`、`/div7a`、`/super`、`/news`、`/settings`、`/import`，并实现 `/api/calendar/export`、`/api/ingest/email`、`/api/backup` 与还原接口。

桌面 UI 以信息密度和可追溯性优先，金额右对齐等宽显示；看板和上传页在窄屏下不横向溢出。自动化只检查窄屏布局和文件选择模拟，不将其描述为真实手机拍照验证。

验证层级：

- Vitest：日期、GST、Div 7A、金额、状态机、AI 脱敏、CSV 去重、BAS 原子锁定。
- Div 7A 官方基准测试必须在 Gate 5 开始前从 ATO 官方 Division 7A calculator 取数并记录来源与取数日期；无法访问时测试使用 `test.skip`，不得用实现者自算值宣称通过。另测贷款发放当年不产生最低还款义务，下一所得年度才开始。
- Playwright：每个已完成 Gate 的用户可见流程；Gate 2 只做桌面和窄屏响应式检查。
- 每次 Gate 结束前执行 production build，并运行对应 Gate 的真实 API/页面流程。

## 10. 验收协议

每个 Gate 的交付报告固定包含：完成文件、测试命令和结果、浏览器验证路径、已知边界、未进入的下一 Gate。报告末尾只询问当前 Gate 是否验收通过。

Gate 0 验收通过后才可写义务生成逻辑；Gate 1 未通过前不得开始 CSV、上传、Inbox 或交易功能；Gate 2 未通过前不得开始 BAS；以此类推。
