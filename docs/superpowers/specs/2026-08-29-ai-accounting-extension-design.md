# 高级 AI 会计副驾扩展设计

**状态：已按用户最新确认修订设计；车辆事实清单已交付；Gate 5 三项基线修复已完成；Gate 6 实现与证据已完成，待用户验收**
**设计日期：2026-08-29（Australia/Melbourne）**
**基础系统：** `docs/superpowers/specs/2026-08-26-tax-compliance-system-design.md`

本文只扩展基础系统的后续范围，不改写已验收 Gate 0–4 的历史证据，也不把 Gate 5 当前尚未验收的实现当成已验收结果。上一轮已授权的三项修复——年度底稿改为不含 GST、Div 7A 余额逐年推进、状态转为 `lodged`/`paid` 时由用户录入并保存 `lodged_at`/`paid_at`——继续执行，属于进入本扩展前的 Gate 5 基线收口，不因本文而取消或改范围。

## 1. 产品目标和已确认事实

### 1.1 用户确认的经营事实

- 公司向个人提供资金目前只走董事借款（Division 7A），暂不发放分红。
- 固定资产数量少，主要是车辆、设备级别，不需要完整固定资产或资本利得引擎。
- 系统由用户自行管理，不再假设有职业税务代理或其他专业人员复核 AI 输出。

### 1.2 系统启用时间与历史年度边界

- 系统正式启用所得年度为 `FY2026–27`，切换日为 2026-07-01。`FY2025–26` 及以前的申报由用户的会计完成，系统不把它们当作自管待办。
- 第一次真实交付是 `FY2026–27 Q1 BAS`，实际截止日为 **11 Nov 2026**。
- 年度模块第一次真实使用是 `FY2026–27` 年度税表，预计在 2027 年 10 月以后进入申报准备流程。
- 设计上增加年度启用配置 `operational_start_income_year = FY2026–27`，并预留义务状态 `external`。所得年度早于启用年度的历史年度税表义务显示为“由外部会计处理”，而不是 `todo`。
- `external` 是只读历史状态：保留原始期间、所属年度和日期供追溯；不进入待办数量，不生成提醒或 `.ics`，不能转为本系统的 `lodged`/`paid` 流程，也不触发本系统的资料缺口警告。该状态和启用配置本轮只写入设计，不在 Gate 5 实现。

### 1.3 产品定义

本系统是“本地账本 + 确定性税务计算 + AI 解释/整理”的高级 AI 会计副驾，不是自动报税代理：

1. 用户提供各主体的银行流水、发票、收据、合同和 ATO 预填数字。
2. 系统将数据按主体、期间、GST 代码和所得年度整理，生成 BAS/年度底稿、提醒、操作指引和可追溯的计算过程。
3. AI 只在脱敏后的输入上做分类辅助、解释、资料缺口提示和方案文字整理；金额、日期、状态和法定结论由确定性规则控制。
4. 用户在 ATO/ASIC 网站上手动提交。系统不保存提交凭证以外的 ATO 登录信息，也不调用提交端点。

系统输出的是“可核对的工作底稿、风险提示和待办”，不是未经核对即可执行的税务建议。因为没有专业复核人，无法确定的事项必须停在“无法判断 / 需要补资料”，不能用默认税率、估算金额或模型猜测补齐。
所有规划只讨论有证据支持的合法合规处理，不提供隐藏收入、虚假凭证或规避法定义务的方案。

## 2. 范围边界

### 2.1 保留并完善的功能

- 六个固定主体：`self`、`spouse`、`boyun_trust`、`boyun_co`、`yeeliving_co`、`neighbourhood_co`。
- 银行 CSV、文件/照片、邮箱转发和手动录入；所有交易进入人工确认队列后才能进入底稿。
- 银行期初/期末余额、流水合计、账本交易和 worksheet 汇总的金额匹配与差异提示；差异只提示，不自动改账。
- Simpler BAS：G1、1A、1B 为外部填表指引；G10/G11 只做内部核算并明确“不填入 ATO 表单”。
- PAYG 5A/5B 由用户依据 ATO 预填数字录入；系统保存 `payg_instalment_cents` 兼容字段，并区分 `gstNetCents` 与 `statementTotalCents`。
- FY 所属年度、截止日所在财年、法定日、实际工作日分开保存和展示。
- CAV 牌照年度声明、三家公司 ASIC 年度 review，以及每项义务的网站、表单标签和操作步骤。
- 提醒：T-30、T-10、T-3、当天、逾期后每日；支持墨尔本本地日期的 `.ics` 导出。
- ATO/ASIC/CAV 等监管资讯面板：真实来源抓取、近 90 天窗口、主体相关关键词预筛、可能不适用和日期未知分区、单源失败不阻塞首屏。
- BAS/年度底稿、关账期补录安全阀、审计日志、备份和还原。
- Div 7A 完整工作流、轻量资产登记、PSI 向导和三个合规规划情景。

### 2.2 明确移除的范围

以下功能不在本扩展中，不应以页面、表、接口或“暂未配置”的方式留下隐含壳子：

- 股东、股份类别、股权结构或分红方案。
- 分红情景、偿债能力测试、董事会决议草稿。
- 信托向公司受益人分配与未分配权益（UPE）。依据是用户确认 Boyun Trust 只向 `self`、`spouse` 两个个人受益人分配；若将来受益人结构变化，必须作为新的范围变更重新评估。
- 资本利得（CGT）模块。
- 完整政策规则版本库、自动政策推理或自动从网页推断税率。
- 工资单、STP、Payday Super、雇员工资资讯流。
- ATO/ASIC 自动申报、自动付款、自动登入或保存政府网站凭证。

`franking account 余额`保留为公司年度底稿的人工补充字段；它不是分红功能，也不由系统推算。

## 3. 使用流程和用户需要准备的资料

### 3.1 端到端流程

```text
资料收集
  → 文件/CSV/邮箱/手动录入
  → 主体、账户、GST 代码人工确认
  → BAS 期间底稿 + PAYG 5A/5B 人工录入
  → 用户核对、标记 lodged/paid
  → 关账期补录进入独立队列
  → 按 income_year 生成年度底稿
  → PSI 门槛判断
  → Div 7A / 养老金 / 资产数据完整性检查
  → 三个规划情景对比
  → 用户确认后形成手动待办
  → 用户自行在 ATO/ASIC/CAV 网站提交
```

### 3.2 首次建立账本时的必备资料

每个公司需要提供：

- ABN/ACN、GST 注册状态、ASIC review 周年日、公司税表的 ATO 应提交截止日和实际提交日（若已提交）。
- 每个银行账户的 CSV 或对账单、账户归属、CSV 日期格式；金额列必须能精确解析为分。
- 发票/收据及交易描述；每笔需人工确认收入、运营费用、资本采购、无 GST、私人项目等 GST 代码。
- 每季度 ATO 预填的 PAYG 5A 应缴和 5B 贷记；没有分期预缴时必须显式勾选“本期无 PAYG 分期”。

个人和信托需要提供：

- 与主体有关的收入、费用、信托分配、养老金供款和基金回执。
- 不把 TFN 上传或填写进系统；如外部文件含 TFN，进入 AI 或日志前必须脱敏。

Div 7A 每笔借款需要提供：

- 出借公司、借款人、放款日期、本金、借款类型/担保类型、原始期限。
- 书面协议签署日期、协议文件、利率条款、是否满足书面/期限/利率条件。
- 每笔实际还款日期和金额；不能只输入系统建议的最低还款额。
- 贷款所属所得年度的公司税表应提交日、实际提交日，以及相应年度 ATO 基准利率记录。

资产登记需要提供：

- 资产名称、主体、购置日或开始可用日、发票成本（不含 GST）、手动有效年限、prime cost 或 diminishing value、私人使用比例。
- 已有累计折旧和账面余额（如资产不是本系统从购置日开始登记）。
- 车辆还需要行驶记录簿/里程表、司机与公司关系、公司/私人使用、员工/董事付款和车辆费用。

规划前还必须补充：

- 每家公司 PSI 来源/客户、每个来源金额、是否关联、是否来自向公众发出的服务要约。
- 结果测试的合同结果、工具设备、缺陷返工责任证据。
- 个人养老金年度已到账金额、供款类型、notice of intent 及基金确认、上一年 30 June 的 total super balance，以及可用追补额度资料。
- 用户希望保留的公司现金、预计个人现金需求、Div 7A 还款可用现金等非账簿假设。

任一资料没有证据时，界面显示“无法判断 / 需要补资料”，并列出所缺字段和影响的情景；系统不填 0、不猜客户关系、不把未收到基金账户的供款视为已到账。

### 3.3 2026-06-30 期初切换资料

系统从 2026-07-01 开始接手，但许多余额来自更早年度。期初资料统一以 **30 Jun 2026** 为切换时点，来源优先为会计的 `FY2025–26` 底稿；不要求为了重建历史而逐笔录入切换日前的全部交易或还款。

- **Div 7A**：每笔借款的 30 Jun 2026 未偿余额、原始发放所得年度、原始期限、担保类型和协议状态。余额作为 `FY2026–27` 的期初余额逐年推进，历史还款不要求补录。
- **资产**：累计折旧和账面余额作为资产登记的期初值；后续年度折旧从该状态继续计算。
- **公司**：结转亏损、`franking account` 余额。
- **信托**：FTE 状态、结转亏损。

每一项期初余额都必须记录数值/状态、切换日期、来源说明（例如“会计 FY2025–26 底稿”）、录入人和录入日期，并在同一事务中写入 `audit_log`。未录入时相关计算必须显示“无法判断 / 期初余额未配置”，不得假设为零。

## 4. 已确认的基础能力和不变约束

### 4.1 日期、时区和金额

- 业务时区唯一使用 IANA 标识 `Australia/Melbourne`，日期计算用 `date-fns-tz`；禁止固定 UTC+10/UTC+11 或把 UTC 日期字符串直接当墨尔本日期。
- 数据库存储日期为本地 `YYYY-MM-DD`；只读展示固定 `DD MMM YYYY`，例如 `15 Jul 2026`；输入固定显示 `DD/MM/YYYY` 并带格式提示，不能依赖浏览器 locale。
- 任何金额字段均为整数分。数据库列为 INTEGER，服务层用安全整数校验；利率等非金额参数用精确字符串/Decimal，不能把浮点结果作为金额中间值。
- 年度收入、运营费用和资本采购均按不含 GST 口径进入年度底稿：`amount_cents - gst_cents`；`GST_FREE_INCOME`、`INPUT_TAXED`、`NO_GST` 的 GST 为 0，`PRIVATE` 完全排除。

### 4.2 数据安全、AI 和可追溯性

- TFN 不入库、不进审计日志、不进入 AI payload。银行账号、完整地址和其他敏感识别信息在发送前脱敏。
- AI 缓存使用脱敏 canonical JSON 的 SHA-256；`ai_cache.redacted_input_json` 不保存原值。
- AI 结果不能直接写入 `transactions`、`obligations`、BAS 金额或已递交底稿。用户确认只能建立独立的规划待办/资讯待办和审计记录。
- 每次义务状态变更、规划确认、关账期补录选择和手动规则覆盖均写入 `audit_log`。
- 已 `lodged`/`paid` 的 worksheet 是不可变快照。新交易不能静默改变原底稿数字。

### 4.3 运营启用配置与历史义务（设计阶段）

建议在年度配置中保存 `operational_start_income_year`，初始值为 `FY2026–27`。义务生成器按 `income_year` 与该配置比较：历史年度税表显示 `external / 由外部会计处理`，当前及以后年度才进入本系统的待办、提醒、操作指引和状态流转。历史记录仍可查询、导出和审计，但不能被误显示为“待配置”或“待处理”。本规则需要在后续已批准的 Gate 中实现；Gate 5 不改变现有历史数据。

## 5. 数据模型扩展

扩展沿用 SQLite + Drizzle，金额列全部为整数分；利率不是金额，使用规范化文本保存以避免二进制浮点误差。本文指定的表和字段是实现契约。

### 5.1 Div 7A 年度利率与贷款协议

新增 `div7a_benchmark_rates`：

| 字段 | 类型 | 规则 |
|---|---|---|
| `income_year` | TEXT PK | 如 `FY2025-26` |
| `rate_text` | TEXT | ATO 年度基准利率的原始精确文本，如 `5.30%`；不由系统推定 |
| `source_url` | TEXT | 该行实际取数的 ATO 来源 |
| `retrieved_at` | TEXT | 取数日期，`YYYY-MM-DD` |
| `entry_method` | TEXT | `manual` 或经用户确认的导入，默认 `manual` |
| `notes` | TEXT | 适用条件或人工说明 |

现有 `div7a_loans.benchmark_rate` 只作为旧数据迁移兼容字段，不再是年度计算的权威来源。计算某一所得年度时必须按 `income_year` 查表；缺行时返回“无法判断 / 基准利率未配置”，不得回退到另一年度或贷款创建时的旧值。

现有 `div7a_loans` 增加：

- `agreement_signed_at`：书面协议签署日，可空。
- `agreement_document_id`：可空的 `documents.id`。
- `agreement_terms_status`：`unknown`、`compliant`、`not_compliant`、`needs_review`。
- `security_type`：`unsecured`、`registered_mortgage`、`unknown`；不得默认按七年处理未知担保类型。

`obligations` 增加 `scope_key`，普通主体义务为 `entity`，每笔贷款协议义务为 `loan:<loanId>`；唯一键扩展为 `(rule_id, entity_id, period_label, scope_key)`，避免同一公司多笔贷款互相覆盖。

新增规则 `div7a_loan_agreement`：它是每笔贷款独立的义务，`entity_id` 为出借公司，`scope_key` 指向贷款。它不复用年度税表卡片，也不把协议状态藏在贷款详情里。

### 5.2 轻量资产登记

新增 `assets`：

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | INTEGER PK | |
| `entity_id` | TEXT FK | 所属主体 |
| `name` | TEXT | 资产名称 |
| `purchase_date` | TEXT | 本地日期 |
| `available_for_use_date` | TEXT | 可空；缺失时不能假设与购置日相同而隐藏差异 |
| `cost_ex_gst_cents` | INTEGER | 不含 GST，非负 |
| `useful_life_years` | INTEGER | 用户手动输入，正整数 |
| `method` | TEXT | `prime_cost` 或 `diminishing_value` |
| `private_use_percent` | INTEGER | 0–100 的整数百分比，不用小数 |
| `accumulated_depreciation_cents` | INTEGER | 非负整数分 |
| `book_value_cents` | INTEGER | 保存时校验等于成本减累计折旧 |
| `notes` | TEXT | 特殊税务处理、例外或人工核对说明 |

只实现轻量年度计算和登记，不实现低值资产池、简化折旧、资本工程、资产处置 balancing adjustment 或 CGT。年度计算使用用户输入的有效年限和方法，以整数分/整数天数计算；无法确认开始可用日、有效年限、方法或特殊制度时不输出估算值。

年度底稿显示三项：资产总折旧、按私人使用比例调整后的业务/应税用途折旧、待人工核对项。由资产推导的金额为只读来源行，不能与既有手动“折旧”补充项重复计入；例外调整必须单独记录并审计。页面和导出标注“折旧为轻量管理计算，年度税表使用前需人工核对”。

### 5.3 PSI 录入与判定

新增 `psi_assessments`（每个公司、所得年度和测试个人一行）和 `psi_sources`（每个 PSI 来源一行）。所有金额字段为 INTEGER 分；不存 TFN。

`psi_sources` 至少包含：来源标识、`amount_cents`、是否关联（`yes/no/unknown`）、是否由向公众发出的要约直接取得（`yes/no/unknown`）、结果测试三项证据：

- 是否按合同为指定结果/成果付费；
- 是否提供必要工具设备（若不需要工具，记录为满足）；
- 是否自行承担缺陷返工责任。

`psi_assessments` 保存：`psi_status`、`results_test_status`、`results_test_covered_cents`、`eighty_percent_status`、最大来源金额、`unrelated_clients_status`、不关联客户数量、公众要约状态、`psb_status`、资料快照和人工确认时间。

所有判断字段都是 `yes/no/unknown` 三态；`unknown` 不能转成 `no`。

### 5.4 规划结果快照

新增 `planning_runs` 和 `planning_scenarios`：

- `planning_runs` 保存一次运行的 `entity_id`、`income_year`、输入快照哈希、运行时间和整体状态。
- `planning_scenarios` 保存 `scenario_id`、`status`（`ready`、`needs_more_data`、`not_applicable`、`manual_review`）、假设 JSON、来源 JSON、未纳入因素 JSON、输入快照、确定性计算结果和用户确认时间。

规划结果是版本化快照，不反写交易、义务、账户或 worksheet。用户确认只会写 `planning_scenarios.confirmed_at`、独立待办（如有）和 `audit_log`。

### 5.5 期初余额表与审计契约

新增设计表 `opening_balances`，用于把 30 Jun 2026 会计底稿中的余额/状态带入系统，而不是用历史交易重算：

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | INTEGER PK | |
| `entity_id` | TEXT FK | 所属主体 |
| `category` | TEXT | `div7a_loan_balance`、`asset_accumulated_depreciation`、`asset_book_value`、`company_tax_loss`、`company_franking_account`、`trust_fte`、`trust_tax_loss` |
| `reference_type` | TEXT | `entity`、`loan` 或 `asset` |
| `reference_id` | TEXT | 贷款/资产行的稳定标识；主体级项目可空 |
| `as_of_date` | TEXT | 本期固定为 `2026-06-30`，未来切换可扩展 |
| `amount_cents` | INTEGER NULL | 金额类期初值；整数分，可为负的税务亏损仍须明确记录 |
| `value_text` | TEXT NULL | FTE 状态等非金额值；不能用空字符串冒充已配置 |
| `source_description` | TEXT | 例如“会计 FY2025–26 底稿” |
| `entered_by` | TEXT | 用户/操作员标识 |
| `entered_at` | TEXT | 录入时间，按 `Australia/Melbourne` 记录 |
| `notes` | TEXT | 来源页码、核对说明或限制 |

Div 7A 的原始发放所得年度、原始期限、担保类型和协议状态仍属于贷款记录；`div7a_loan_balance` 通过 `reference_id = loan:<id>` 关联该贷款。资产的累计折旧和账面余额既可保留在资产当前字段，也必须通过两条带来源的期初记录说明它们是切换时点值。每一条插入、修改或作废都必须和 `audit_log` 在同一原子事务内完成。

计算门控规则是：缺少对应期初行时返回“无法判断 / 期初余额未配置”；禁止回退到贷款本金、资产成本、历史会计默认值或零。

## 6. Div 7A 完整设计（第一优先级）

### 6.1 年度基准利率

每一个用于计算的所得年度必须有一行人工录入的 ATO 基准利率。ATO 说明，Div 7A 年度基准利率采用所得年度开始前 RBA 最后发布的指定住房贷款指标利率；年度开始后 RBA 修订历史发布值，不改变该年度基准利率。系统只保存用户从 ATO 资料核对后的值，不自动抓 RBA、不外推未来年度、不用其他年度值代替。

UI 需要同时显示：所得年度、利率、ATO 来源链接、取数日期、录入方式和“未配置时不可计算”。

### 6.2 协议截止日独立义务

ATO 的 Division 7A `lodgment day` 是公司该所得年度税表的实际提交日与应提交截止日两者较早者。设计为：

```text
company_return_due = company_tax_return.effective_due
lodgment_day = min(company_tax_return.lodged_at（若已录入）, company_return_due)
```

这里的 `effective_due` 是公司税表适用的 ATO 实际应提交日（包括应有的工作日调整），不是仅用于审计展示的原始 `statutory_due`。如果实际提交日早于该日期，实际提交日优先；如果尚未提交，使用实际应提交日。

`lodged_at` 必须由用户录入，不能默认为当天。公司税表较早提交后，协议义务必须重新计算为较早的实际提交日；未提交时先使用税表应提交截止日。该日期是 Div 7A 协议的精确法律截止日，不套用 BAS 的额外两周，也不以通用周末顺延制造更晚日期。

在 `lodgment_day` 之前，系统需要能核对：

- 协议是否书面成立；
- 利率是否达到适用年度基准利率；
- 期限是否符合适用的最高期限；
- 书面协议日期和协议文件是否存在。

缺资料或条件不清时显示 `blocked / 无法判断`，不把“有一张上传文件”自动视为合规。截止日提醒使用 T-30、T-10、T-3、当天及逾期每日；协议义务单独出现在看板、Inbox 和 `.ics`。

### 6.3 最低年度还款、短缺和余额

每个所得年度按以下顺序计算：

1. 期初余额是上一所得年度末的实际期末余额；贷款发放年度不产生最低还款。
2. 使用该所得年度的 `div7a_benchmark_rates` 行计算利息。
3. 读取该年度实际还款，按 ATO 计算口径分解利息和本金影响。
4. 期末余额 = 期初余额 + 年度利息 − 实际还款，最低不低于零。
5. 在仍处于合同期限内时，按期初余额和当年剩余年限重新计算最低还款；使用 `remainingTermYears`，不是原始 `termYears`。

对本系统首次年度 `FY2026–27`，若贷款早于切换日，第一年的期初余额必须取 `opening_balances` 中 30 Jun 2026 的未偿余额；不得要求用户先录入所有历史还款，也不得从原始本金直接重建一个未经会计底稿支持的余额。

页面每年显示：所得年度、适用利率及来源、期初余额、利息、最低还款、实际还款、期末余额、剩余年限、协议状态和还款截止日。

如果 `actualRepaymentCents < minimumRepaymentCents`，显示：

> 最低还款缺口：$X。缺口部分可能产生 ATO 所称的视同未分配/无 franked 的 deemed dividend 后果；请核对 ATO 规则和资料。系统不自动创建分红记录，也不把该金额写入分红模块。

贷款发放当年显示“无最低还款要求（发放年度）”，不显示缺口。原始七年期届满后显示“已到期”，最低还款为“—”，并要求人工确认余额是否已清偿、是否有新的合规安排；系统不擅自把未清余额判成某一种税务结果。

### 6.4 Div 7A 证据和测试原则

- 官方计算器基准必须使用 `tests/fixtures/div7a/` 中的外部取数 fixture；测试注释写 ATO calculator URL 和取数日期，不能从实现函数复制期望值。
- 测试覆盖：年度利率缺失、协议截止日取较早日期、协议条件缺失、发放年为零、连续年度余额推进、还款缺口、七年期满和页面四项余额字段。
- 官方基准无法访问时测试只能 `test.skip`，报告列出人工核对项，不能以自算值通过。

### 6.5 官方依据

- [ATO Division 7A benchmark interest rate](https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/private-company-benefits-division-7a-dividends/division-7a-benchmark-interest-rate)，取数日期 2026-08-29。
- [ATO Division 7A calculator and decision tool](https://www.ato.gov.au/calculators-and-tools/division-7a-calculator-and-decision-tool?page=1)，取数日期 2026-08-29。
- [ATO Managing Division 7A risks and corrective action](https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/private-company-benefits-division-7a-dividends/managing-division-7a-risks-and-corrective-action)，取数日期 2026-08-29。
- [ATO section 109N](https://www.ato.gov.au/law/view/document?LocID=%22PAC%2F19360027%2F109N%281%29%28b%29%22)，取数日期 2026-08-29。

## 7. 养老金、资产和年度底稿的衔接

养老金既有年度上限表继续按所得年度存储，不改成单一当前值。现行设计中的用户确认基准为：FY2025–26 concessional cap `3,000,000` 分，FY2026–27 `3,250,000` 分，non-concessional `13,000,000` 分；实现时必须从 ATO 完整分段表逐年核对，每行写来源 URL 和取数日期，历史年度不能被当前值覆盖。

养老金规划只能使用“已到账”的 `paid_at` 记录和基金确认；供款到账待办与 notice of intent 待办保持独立。到账截止使用 `backward` 方向，30 June 落在周末时不能推入下一财年。

年度公司、信托、个人底稿按 `income_year` 聚合，不按截止日所在财年聚合：

- 公司：不含 GST 的收入、运营费用、资本采购、资产折旧、结转亏损、franking account 余额（人工）、Div 7A 借款余额（人工/系统快照）。
- 信托：不含 GST 的收入和支出、折旧、结转亏损、信托 FTE 状态（人工）。
- 个人：不含 GST 的个人收入/扣除、折旧（如适用）、结转亏损；不出现 franking account 或信托 FTE。

## 8. 公司车辆私人使用：先分析，暂不自动判定

本节是设计和资料采集协议，不在“车辆分析 Gate”中写入自动选择 FBT 或 Div 7A 的代码。公司名下车辆由用户提供事实后，系统可以并列展示两条路径；如果两条都可能相关，显示“无法判断 / 需要补资料”，不擅自选一条。

### 8.1 路径 A：FBT

ATO 的 FBT 规则通常关注雇主是否因雇佣关系向员工、董事或其关联人提供福利；公司车辆可因提供员工私人使用而形成 car fringe benefit。FBT 年度是每年 1 April 至次年 31 March。一般 FBT return 和缴款截止日为 21 May；通过符合条件的税务代理电子申报可能有不同截止安排，但本系统不假设有代理。既有 FBT 客户还可能需要随 activity statement 按季度缴纳 instalments，最后年度结算。

若使用 operating cost method，需要每辆车在具代表性的连续 12 周保存行车记录簿，并保留年度起止里程表等记录；一份记录簿通常可沿用最多五年，若使用模式重大改变则需重新记录。记录必须能区分商业行程与私人行程，不能只写“business”或“miscellaneous”。

如果用户确认 FBT 适用，未来 obligation 规则必须独立于 30 June 所得年度：例如以 `FBT FY2026-27` 表示 1 April 2026–31 March 2027，并以该 FBT 年度的 return/payment 截止日生成独立提醒，不混入 BAS 或公司所得税卡片。

### 8.2 路径 B：Div 7A 的公司资产使用

ATO 对私营公司资产的说明指出，向股东或其关联人提供资产使用权、让资产排他性地供其使用，或以 licence/lease 形式提供，可能构成 Division 7A 的 payment；即使没有正式协议或没有实际使用，也可能需要分析“available for use”的事实。公司资产私人使用与 FBT 的关系不能靠单一字段自动决定，ATO 也说明存在两套规则可能同时需要考虑的情形。

这条路径需要核对：车辆使用者与公司/董事/股东/关联人的关系、车辆是否仅供该人排他使用、是否有租赁/许可或付款、使用是否因雇佣关系提供、是否有员工缴款、车辆费用和私人/商业里程、书面协议和公司税表 `lodgment day`。系统只呈现事实和待核对事项，不自动宣布“属于 Div 7A”或“属于 FBT”。

### 8.3 必填事实和输出

车辆向导必须收集：车辆取得/可用日期、成本不含 GST、使用者身份和角色、私人可用期间、商业/私人公里数、每年费用、员工/董事付款、12 周 logbook、年度 odometer、是否注册 FBT、是否有书面 loan/lease/licence。

输出为：

- FBT 路径：`possible / not_shown / unknown`，年度范围、记录缺口和 21 May/instalment 提示。
- Div 7A 路径：`possible / not_shown / unknown`，资产可用事实、协议/付款缺口和相关 lodgment day 提示。
- 两路径冲突或资料不足时：红色“无法判断 / 需要补资料”，不产生税额。

### 8.4 官方依据

- [ATO Fringe benefits tax overview](https://www.ato.gov.au/Business/Fringe-benefits-tax/)，取数日期 2026-08-29。
- [ATO Calculating your FBT](https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/fringe-benefits-tax/calculating-your-fbt)，取数日期 2026-08-29。
- [ATO FBT guide for employers](https://www.ato.gov.au/law/view/document?DocID=SAV%2FFBTGEMP%2F00001&document=document)，取数日期 2026-08-29。
- [ATO Small business car FBT guide](https://www.ato.gov.au/api/public/content/1e05625c-774c-4631-84ef-f2c1f4537bad_n75353_Car_fringe_benefits_guide_for_small_business_pdf)，取数日期 2026-08-29。
- [ATO Payments by private companies – use of assets](https://www.ato.gov.au/api/public/content/0-df9bf50b-461c-4f07-b86b-f6fe8b2cc89a)，取数日期 2026-08-29。

## 9. PSI 定性向导：规划前置门槛

Boyun 收到的地产销售佣金可能是个人服务收入，但系统不能只根据“佣金”二字下结论。每家公司、每个产生 PSI 的个人分别评估；若一个公司有多个产生 PSI 的个人，不能把一个人的测试结果套给另一个人。

### 9.1 结果测试

向导按每个 PSI 来源采集三个证据：

1. 合同是否以交付指定结果/成果为付款条件；
2. 是否必须提供必要工具设备（不需要工具时该项视为满足）；
3. 是否承担缺陷返工责任。

至少 75% 的该个人 PSI 需要同时满足三项，才可把结果测试标为通过。任一来源金额或证据缺失，覆盖比例显示“无法判断”。

### 9.2 80% 规则

按同一实体及其关联人汇总 PSI 来源，显示最大来源金额/总 PSI 的比例。达到或超过 80% 时，不能在缺少其他法定条件或 PSB determination 的情况下把其他测试结果当作可自评通过；系统显示“80% 门槛阻止自评 / 需要补资料”。

### 9.3 Unrelated clients test

向导需要至少两名彼此不关联且与测试个人不关联的客户，并确认服务是否因向公众发出要约而直接取得。佣金代理等特殊规则需要额外事实，不能因为客户名单存在就自动通过。

### 9.4 规划门控

PSI 输出拆为：`income_is_psi`、`psi_rules_apply`、`psb_status`。若 `psi_rules_apply = yes`，保留公司利润情景直接显示“不适用”，不计算一个看似精确的公司税额；若任一关键结论为 `unknown`，所有受影响情景显示“无法判断 / 需要补资料”。只有完整证据且用户确认后，规划引擎才可运行对应情景。

### 9.5 官方依据

- [ATO Work out if the PSI rules apply](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/personal-services-income/working-out-if-the-psi-rules-apply/work-out-if-the-psi-rules-apply-to-you)，取数日期 2026-08-29。
- [ATO TR 2022/3 Personal services business](https://www.ato.gov.au/law/view/document?LocID=%22TXR%2FTR20223%2FNAT%2FATO%2Ffp95%22&PiT=20240717000001)，取数日期 2026-08-29。
- [ATO personal services income return instructions](https://www.ato.gov.au/api/public/content/0-6198b9ab-cbc6-4e85-9b14-357732cddb32)，取数日期 2026-08-29。

## 10. 三个合规规划情景

规划模块只保留以下三个情景，不出现分红选项：

### 10.1 保留公司利润

目的不是建议把利润留在公司，而是展示在已确认的 PSI/公司税前提下，“公司保留现金”对公司层面税负和现金的影响。输入必须包括公司收入、可扣费用、年度不含 GST 底稿、折旧、Div 7A/FBT 风险、适用年度税率来源、现金需求和 PSI 结果。PSI rules 适用时状态为 `not_applicable`。

### 10.2 增加养老金供款

输入必须包括供款人、已到账的 concessional/non-concessional 供款、年度 caps、历史未用 cap、上一年 30 June TSB、notice of intent 和基金确认、工作/资格条件及支付截止日。系统只比较有证据的金额；无法确认 carry-forward、Div 293、Medicare levy 或 notice 条件时不输出“可供款多少”的默认数字。

### 10.3 偿还 Div 7A

输入必须包括逐年期初余额、年度利率、协议状态、最低还款、实际还款、短缺、公司 lodgment day、用户可用现金和期限状态。输出显示偿还金额对余额、利息、短缺风险和现金的影响；不得把“偿还最多”当作无条件最佳答案。

### 10.4 统一输出契约

每个情景返回：

```ts
type PlanningScenarioResult = {
  scenarioId: "retain_company_profit" | "increase_super" | "repay_div7a";
  entityId: string;
  incomeYear: string;
  status: "ready" | "needs_more_data" | "not_applicable" | "manual_review";
  assumptions: string[];
  sources: Array<{ label: string; url: string; retrievedAt: string }>;
  includedFactors: string[];
  excludedFactors: string[];
  missingInputs: string[];
  taxBasis: string;
  estimatedTaxImpactCents: number | null;
  cashflowImpactCents: number | null;
  riskFlags: string[];
  notTaxAdvice: true;
  requiresUserConfirmation: true;
};
```

税负估算的每个数字都必须注明口径、所得年度、适用税率来源和未纳入因素。默认排除项至少列出 Medicare levy、Div 293、HELP、franking gross-up/credits、FBT、CGT、个人抵扣资格、现金时点和其他未收集资料；排除项不能隐藏在脚注里。

规划页面固定显示：

> 这是基于已录入资料的合规规划工作底稿，不构成税务建议。你需要自行核对 ATO 现行规则和原始文件；资料不完整时系统不会估算或给出默认方案。

AI 可把确定性结果整理成中文说明、问题清单和待办，但不得新增未经来源支持的税务规则，不得直接修改账本或申报状态。AI 关闭时，确定性计算、缺口提示、来源和“无法判断”流程仍然可用。

## 11. 资讯、操作指引和提醒的回归要求

这些原始需求是主产品，不因新增规划模块而降级：

- 义务卡片继续生成 T-30/T-10/T-3/当天、逾期每日提醒和 `.ics`；新 Div 7A 协议义务沿用自己的精确截止日，未来 FBT 义务使用 FBT 年度和独立截止日。
- CAV 牌照年度声明的窗口开启日与周年截止日分开显示；ASIC 年检只对有配置的公司生成具体日期；缺配置只阻塞该义务。
- 每项义务底稿的操作指引必须写出网站、入口/表名、填写标签和“提交前人工核对”步骤。Simpler BAS 卡只能写 G1、1A、1B，并包含 G1“该金额是否含 GST”选择“是”。
- ATO 资讯面板保留真实来源、90 天设置、关键词命中词、主体排除规则、日期未知分区和 `last_error`。它是资讯提醒，不是政策版本库；资讯不能未经用户确认改变规则常量。
- 前期更正、PAYG、CSV 日期选择器、完整行哈希去重、关账期交易和已递交 worksheet 不可变规则必须有回归测试。

### 11.1 每项义务的操作指引契约

操作指引不是泛泛的“去官网看看”，而是随义务卡保存门户、入口、标签和提交前核对项。标签只写系统已经确定的字段；需要用户从 ATO 预填或原始文件确认的地方必须标为手动输入。

| 义务/模块 | 操作网站或入口 | 指引必须包含的字段/步骤 |
|---|---|---|
| Simpler BAS | [ATO BAS](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas) / ATO Online | G1、1A、1B；G1 后选择“该金额是否含 GST”=“是”；5A 应缴、5B 贷记；核对 `statementTotal` 后由用户提交 |
| 公司/个人/信托年度税表 | ATO Online / myTax 对应年度税表入口 | 所得年度、收入/费用/折旧/Div 7A/分配等已确认底稿；逐项打开 ATO 表单对应标签；系统不代填或代提交 |
| ASIC annual review | [ASIC company annual review](https://www.asic.gov.au/for-business-and-companies/companies/company-annual-review/) | 打开 annual statement，核对公司资料、支付 annual review fee；需要公司自行完成的外部事项不由系统生成董事决议 |
| CAV 牌照年度声明 | [myCAV estate-agent annual statement](https://www.consumer.vic.gov.au/licensing-and-registration/estate-agents/licensing/maintain-your-licence/annual-statement-and-fees) | 在六周窗口内进入 myCAV，填写 annual statement、支付费用；核对周年日和 21 天注销风险 |
| 养老金供款/notice | 对应 super fund 入口 | 核对到账日、供款类型、cap/追补资料；供款到账与 notice of intent 两个待办分别完成 |
| Div 7A | 公司账簿、公司税表资料和 ATO Div 7A 工具 | 核对书面协议、利率、期限、实际还款和 lodgment day；系统只生成工作底稿和提醒 |
| 车辆 FBT/Div 7A | ATO FBT 资料、公司账簿和车辆记录 | 先完成事实清单；FBT 与 Div 7A 两条路径并列核对，不自动选择或提交 |
| ATO 资讯 | 资讯卡原文链接 | 显示来源、首发日期/日期未知、命中关键词和适用主体；资讯不能直接改变任何常量 |

指引卡的外部 BAS 步骤永远不显示 G10/G11；G10/G11 只出现在内部核算区，并标注“不填入 ATO 表单”。

## 12. 安全和失败策略

| 情况 | 处理 |
|---|---|
| 缺少 Div 7A 年度利率 | 不计算最低还款，显示来源缺口和 `manual_review` |
| 协议签署日在 lodgment day 之后 | 协议义务标记高风险，显示 ATO 后果提示，不自动修复 |
| PSI 关键输入 unknown | 规划情景 `needs_more_data`，不输出税额 |
| 车辆可能同时涉及 FBT/Div 7A | 两路径并列为 `unknown/possible`，不自动择一 |
| AI provider 失败/关闭 | 使用确定性结果和人工清单，保留 `last_error`，不阻塞底稿 |
| 规划用户点击确认 | 只记录规划快照、待办和审计，不写交易/义务/BAS |
| 已关账期间新交易 | 独立 Inbox 队列；必须选择 include/revision/exclude，原 worksheet 不变 |

## 13. Gate 划分

新扩展沿用严格逐 Gate 停止。现有 Gate 0–4 是已验收历史基线，Gate 5 是当前尚未验收的基线收口。每个 Gate 交付自己的测试、API/SQL/UI 证据和报告后立即停止，只有用户明确验收才进入下一 Gate。已验收证据不可覆盖；本轮不创建 `gate-5` 标签。

### Gate 5 前置交付：车辆事实清单（非代码）

在 Gate 5 实施前先交付 `docs/superpowers/specs/2026-08-29-vehicle-tax-fact-checklist.md`，供用户打印填写。清单只采集事实，不判断 FBT 或 Div 7A 哪条路径适用。它特别提示当前 FBT 年度为 1 Apr 2026–31 Mar 2027；若后续采用 operating cost method，须核对一段连续 12 周且具有代表性的 logbook，并记录里程表和使用模式。用户填写后的事实将作为后续车辆 Gate 的输入。

### Gate 5 基线收口（既有授权，不是新增范围）

- 年度收入、运营费用、资本采购全部按不含 GST；四季 BAS 的 `G1` 合计减 `1A` 合计后，必须与年度底稿收入一致。
- Div 7A 余额逐年推进，期初余额不再每年恒为本金；官方基准仍来自 ATO fixture。
- `lodged_at`/`paid_at` 使用用户录入日期并实际写入。
- Gate 5 完成后硬停止等待验收。验收通过后仍先冻结后续开发：用户使用真实银行数据和真实发票跑完 `FY2026–27 Q1 BAS`（实际截止 **11 Nov 2026**）；该轮结果可能改变后续优先级，在用户确认前不开始 Gate 6。

### Gate 6 — Div 7A 完整化（最高优先级；真实截止 30 Jun 2027）

- 现有借款在 `FY2026–27` 的最低还款截止日为 **30 Jun 2027**；该日期前必须完成可用的余额、利率和还款资料。
- 年度基准利率表、来源/取数日期和缺失安全行为；早于切换日的贷款先使用 30 Jun 2026 期初余额。
- 公司税表 lodgment day 推导与每笔贷款独立协议义务。
- 协议条件、最低还款短缺、逐年余额、七年期满和提醒/UI。
- ATO 官方基准、发放年零还款、五年序列、缺口和协议截止日测试。

### Gate 7 — 车辆 FBT/Div 7A 事实分析（原 Gate 8 前移；资料窗口正在进行）

- 交付并使用已提前提供的可打印车辆事实清单，分析当前 FBT 年度 `1 Apr 2026–31 Mar 2027` 的车辆可用性、使用者角色、私人/业务公里数、费用、员工付款、logbook 和里程表事实。
- 从 ATO 来源核对 operating cost method 的连续 12 周代表性 logbook、里程表、保存年限，以及一般 FBT return/付款截止日（通常为 21 May 2027；最终以适用事实和官方当期规则核对）。
- 并列记录 FBT 与 Div 7A asset-use 的触发条件、资料缺口和可能同时适用的风险；不自动选择路径，不写 FBT 义务代码，不声明哪一条适用。
- 只有用户完成事实确认后，后续变更才可决定是否另立 FBT 年度义务。

### Gate 8 — PSI 定性向导（须在 30 Jun 2027 前完成）

- 每家公司/测试个人的来源录入、results test、80% rule、unrelated clients test 和三态结果。
- PSI 结论必须在 FY2026–27 结构和现金安排决定前形成；`unknown` 继续阻止规划模块给出数字。
- PSI rules 适用或关键输入 unknown 时，保留公司利润情景标记为不适用/需要补资料。
- 不做未列入本需求的工资、STP 或完整 PSI 政策数据库。

### Gate 9 — 轻量资产登记与折旧（须在 30 Jun 2027 前完成）

- 一张资产表、整数分、手动有效年限、两种方法、私人使用比例、累计折旧/账面余额；支持从 30 Jun 2026 期初累计折旧和账面余额接续。
- 年度底稿按 `income_year` 接入折旧，并标注轻量计算/人工核对；固定资产只有车辆、设备级别，不扩展完整资产处置或 CGT 引擎。
- 资产信息应在 30 Jun 2027 前可供养老金和 Div 7A 现金决策使用；车辆作为资产登记数据来源，但不在本 Gate 自动选择 FBT 或 Div 7A。

### Gate 10 — 三情景保守规划和 AI 解释层（须在 30 Jun 2027 前完成）

- 只实现保留公司利润、增加养老金、偿还 Div 7A。
- 规划要服务于 30 Jun 2027 前的养老金供款与 Div 7A 还款决策；养老金到账截止日不得晚于适用年度的 30 Jun。
- 输入完整性、来源/假设/适用年度/排除项、not-applicable 和 manual-review 状态。
- AI 只整理已确定结果；用户确认写独立快照/待办/审计，不改底稿。

### Gate 11 — 跨模块回归、条件 FBT 义务和手动申报工作台

- 回归提醒、ICS、CAV/ASIC、操作指引、ATO 资讯、年度底稿、备份还原和窄屏布局。
- 在 Gate 7 事实分析完成、且用户明确确认某公司 FBT 适用后，才在本 Gate 以独立 FBT 年度和截止日实现 `fbt_annual_return`；未确认时保持 unknown，不生成卡片。当前可能涉及的 FBT 年度为 1 Apr 2026–31 Mar 2027，通常 return/payment 截止 21 May 2027，不能复用 30 June 所得年度逻辑。
- 完成全量测试、lint、build、真实数据库演练和证据报告；仍不连接 ATO/ASIC 提交端点。

## 14. 资料来源清单和取数纪律

实现每个年度常量或规划规则时，必须在对应数据行/常量旁保存官方 URL 和取数日期。没有官方值时留空并显示未配置，不能用搜索摘要、上一年度值或实现者计算结果替代。

- Div 7A：ATO benchmark rate、calculator、section 109N 和 risks 页面，2026-08-29 核对。
- FBT：ATO FBT overview、calculating FBT、employer guide 和 small-business car guide，2026-08-29 核对。
- PSI：ATO PSI self-assessment、TR 2022/3 和 PSI return instructions，2026-08-29 核对。
- 资产折旧：ATO [Guide to depreciating assets](https://www.ato.gov.au/law/view/document?LocID=%22SAV%2FDEPRECIATING%2FATH9%22&PiT=20230701000001)，2026-08-29 核对；特殊制度不纳入轻量引擎。
- 养老金：ATO [caps, limits and tax on super contributions](https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions)，按年度完整表核对，2026-08-29 记录。
- 操作门户：ATO BAS、ASIC company annual review、Consumer Affairs Victoria 牌照页面沿用基础系统已记录的 URL，并在每次年度更新时保留取数日期。

任何来源页面打不开、只有编辑日期没有首发日期、或内容与现有常量冲突时，报告“无法验证”并停止该常量的自动化使用；不能静默选择一个看起来合理的数字。
