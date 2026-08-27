# Gate 4 资讯退回项复提交 v4

本次仅修复 ATO `published_at`、基于当前主体配置的无关主题排除，以及 ASIC 日期输入框重叠；Gate 5 未开始。

详细真实抓取、SQL、筛选逐条结果和回归命令见 [news-filtered-fetch-report-v4.md](./news-filtered-fetch-report-v4.md)。本次使用全新 `./data/gate4-news-real-20260827-v4.db`，没有修改或删除已验收 Gate 0–3 的证据。

## 验收结论摘要

- ATO 真实 newsroom 列表入库 100 条；`published_at IS NULL` 为 38 条，统一放入「日期未知」区；没有用抓取日或列表页日期回填。
- 「Tax time 2025 is nearly over」已实际保存为 `2025-10-03`；`2026-06-04` 为 0 条，非 NULL 日期的最高重复次数为 5。
- 真实来源结果：ATO 100、ASIC 4、CAV 房产专题 10；Treasury 保留但 `active = 0`，0 条且无错误。
- 90 天窗口起点为 `2026-05-29`；无雇员/无工资排除开关为 true，主列表剩余 9 条，12 条在「可能不适用」折叠区，38 条在「日期未知」折叠区。
- 设置页已显示固定 `DD/MM/YYYY` 输入格式；浏览器 DOM 不含 `DD/MM/YDD/MM/YYYY`。

## 证据

- [ATO SQL 实际输出](./news-ato-published-sql-v4.txt)
- [主列表截图](./gate4-final-news-main-v4db.png)
- [排除主题展开截图](./gate4-final-news-excluded-v4db.png)
- [设置页与日期输入截图](./gate4-final-settings-v4db.png)

## 测试

`npm test -- --run`：25 个测试文件、124 项通过；`npm run lint` 通过；`npm run build` 通过。新增测试覆盖文章页 `Published`、缺失日期为 `NULL`、同 URL 日期纠正、无雇员主题排除和设置开关持久化。

请验收本次 Gate 4 复提交；在验收前我不会开始 Gate 5。
