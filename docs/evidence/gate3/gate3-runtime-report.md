# Gate 3 运行证据（修订版）

运行日期：2026-08-26
数据库：默认 `./data/app.db`。以下 worksheet/交易快照 ID 来自同一次最终 Gate 3 E2E 运行；运行结束后会清理本地测试夹具，不把 evidence 数据库作为应用输入。

![Gate 3 BAS 底稿截图](./bas-summary.png)

## 修复项验收结果

- **无 PAYG 分期**：BAS 页新增「本期无 PAYG 分期」显式选项。勾选后写入 `payg_5a_cents = 0`、`payg_5b_cents = 0`，`paygInstalmentCents = 0`，并计算 `statementTotalCents = gstNetCents`，开放递交金额校验。
- **PAYG 5A/5B**：5A 为应缴、5B 为贷记，公式为 `statementTotalCents = gstNetCents + payg5aCents - payg5bCents`。负数允许保存，界面标为「退税」；非负数标为「应缴」。系统不推算 PAYG。
- **G1 含 GST**：Simpler BAS 指引新增「填写 G1 后，对“该金额是否含 GST”选择“是”」。指引卡仍只列 G1、1A、1B，G10/G11 只出现在内部核算区并标注「内部核算用，不填入 ATO 表单」。
- **nil BAS 全流程**：单元测试覆盖显式无 PAYG 后 `draft_ready → lodged → paid`；浏览器流程覆盖勾选、金额为 0、递交记录。

## 测试结果

- `npm test`：20/20 个测试文件、91/91 个测试通过。
- `tests/unit/gst-bas-mapping.test.ts`：12/12 通过；包含 5A/5B 减法和负数退税断言。
- `tests/unit/bas-instructions.test.ts`：1/1 通过；包含 G1 含 GST 选择，且不包含 G10/G11。
- `tests/unit/bas-generator.test.ts`：5/5 通过；包含 nil BAS 无 PAYG 的 `draft_ready → lodged → paid` 流程。
- `tests/unit/db-schema.test.ts`：6/6 通过；确认 `payg_5a_cents`、`payg_5b_cents` 为可空 INTEGER。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm run test:e2e -- tests/e2e/gate3-bas.spec.ts`：1/1 通过。

## BAS 运行结果

本轮浏览器流程为三家公司生成 FY2026–27 Q1：

| 主体 | worksheet ID | 最终状态 | 交易快照 ID（不是笔数） | GST net（分） | PAYG 5A（分） | PAYG 5B（分） | statement total（分） |
|---|---:|---|---|---:|---:|---:|---:|
| Boyun Pty Ltd | 14 | `lodged` | `#22` | 10,000 | 2,500 | 0 | 12,500 |
| Yeeliving Pty Ltd（易居） | 15 | `draft_ready` | `#23` | 20,000 | 未录入 | 未录入 | 待录入 |
| Neighbourhood Project Pty Ltd | 16 | `lodged`（nil BAS） | — | 0 | 0（已确认无 PAYG） | 0 | 0 |

三家公司均使用同一套 Simpler BAS 指引；操作指引只列 G1、1A、1B。G10/G11 仍保存在内部核算区，并明确标注“内部核算用，不填入 ATO 表单”。Boyun 的已递交金额按 `statementTotalCents = gstNetCents + payg5aCents - payg5bCents` 校验，12,500 分匹配后才成功记录 ATO 回执。Neighbourhood 勾选「本期无 PAYG 分期」后以 0 分完成 nil BAS 递交。

生成操作在单个 SQLite transaction 内完成校验、汇总、快照、worksheet 写入、义务状态更新和交易锁定；存在待确认交易时会整体回滚。nil 路径生成全零底稿并显示递交 nil activity statement 的提示。

## Gate 2 遗留项确认

### CSV 日期格式选择器

已实现并保留在已验收 Gate 2 代码中：

- `components/ledger/csv-mapping-wizard.tsx` 提供日期格式选择器。
- 支持 `DD/MM/YYYY`、`YYYY-MM-DD`、`MM/DD/YYYY`，默认 `DD/MM/YYYY`。
- 选择结果写入 `csv_mapping_templates.mapping_json.dateFormat`，随银行模板保存。
- 预览区在「解析后日期（DD MMM YYYY）」中显示解析结果；导入前会按选定格式逐行预检。
- 格式不匹配、月份超过 12 或日期不存在时阻止导入，并提示「可能选错格式」。
- `tests/unit/csv-import.test.ts`：7/7 通过；`03/04/2026` 在 `DD/MM/YYYY` 下为 `2026-04-03`（Q4），在 `MM/DD/YYYY` 下为 `2026-03-04`（Q3），错误月份会被阻止。

### CSV 去重键

实际键为：

```text
SHA-256(JSON.stringify(按列名排序的完整原始 CSV 行)) + 解析后的 DateOnly + amountCents
```

因此完整原始行中的**描述列**以及其他原始 CSV 列都进入 SHA-256；日期和金额还会以规范化后的日期、整数分追加到比较键。相同日期、相同金额但描述不同的两行不会被标记为重复；完整相同的两行会被标记为 `duplicate`。对应断言已在 `tests/unit/csv-import.test.ts` 中通过。

## 导出与日期

- CSV 与 PDF 导出均使用 `DD MMM YYYY` 日期；CSV 浏览器测试断言包含 `04 Jul 2026` 且不包含 `2026-07-04`。
- PDF：A4、1 页、PDF 1.4；已用 `pdftoppm` 渲染并人工检查，内容包含 `28 Oct 2026`、`11 Nov 2026`、`04 Jul 2026`，没有 ISO 日期或美式日期。当前环境的 `pdftoppm` 输出了 Fontconfig 配置缺失警告，但仍成功生成可读 PNG。
- BAS 底稿截图与 PDF 均位于 `docs/evidence/gate3/` 或 `output/pdf/`；没有覆盖 Gate 0–2 证据文件。
- BAS 截图 SHA-256：`9da2f86ce744f5b0e04e9e1f966fbd6b4b5d35aa9ef4c4949f6d0ac45310a6bc`。
- PDF SHA-256：`9b2717da4b4885e06267c72b448f5b3aedae213683a69cca9f4dcd01255578ce`。

## 浏览器边界

在本地运行实例上用 390×844 窄屏检查了看板与 BAS 底稿页：文档宽度等于视口宽度、无横向溢出、指引和金额区可见，控制台无 error/warning。未声称验证真实手机拍照、摄像头权限或手机系统上传流程。

Gate 3 已完成并停在此处，未开始 Gate 4，等待用户验收。
