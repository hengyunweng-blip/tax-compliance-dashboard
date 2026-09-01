# Gate 8 精简报告

执行日期：2026-08-30（Australia/Melbourne）

代码提交：`807c5c7489652d320b2517fd8f79b40d7fb8022e`
报告提交：`451e20baf816909199634e7eca891ef5885320d1`
前置标签：`gate-7`；未创建 `gate-8`。

## 已完成

- Div 7A：s109R 风险提示、用户复核、合并贷款展示、年度余额与利息计算。
- 资产：轻量登记、prime cost / diminishing value、私人使用调整、期初余额、处置年度比例。
- 财年：FY2026–27 与 FY2027–28 义务生成，重复生成幂等。
- 信托：向 `self`、`spouse` 分配并同步个人年度底稿。
- 备份：数据库与文件 ZIP 导出、还原、七组表逐行比较。
- 依赖：`drizzle-orm 0.45.2`、`sharp 0.35.4`；未运行 `npm audit fix`。

## 关键验证结果

| 项目 | 结果 |
| --- | --- |
| FY2026–27 义务 | 30 条；BAS 12 条 |
| FY2027–28 义务 | 30 条；BAS 12 条 |
| 公司 BAS 与年度收入对账 | Boyun、Yeeliving、Neighbourhood 差额均为 0 |
| 信托分配 | 125,000 + 125,000 = 250,000 分配收入 |
| 资产折旧与账面减少 | 三家公司差额均为 0 |
| Div 7A 余额恒等式 | 4 笔贷款差额均为 0 |
| 备份还原 | diff 退出码 0；七组表行数一致 |
| lint / build | 通过 |

## 测试结果

- 首轮全量 Vitest：36 个文件、190 个用例全部通过。
- 随机顺序 Vitest：35 个文件、189 个用例通过；1 个失败。
- Playwright：14 个声明已实际运行，但未全部通过。

## 未修复发现

1. **高严重度**：`tests/setup.ts` 使用进程级共享测试数据库，随机顺序会导致 `div7a-agreement.test.ts` 外键失败。
2. **中严重度**：Playwright 测试存在跨测试共享状态，完整套件未通过。
3. **中严重度**：`/div7a` 在 390px 窄屏发生横向溢出。
4. **无法验证**：真实墙上日期进入 FY2027–28 后是否自动触发展开。
5. **无法验证**：设置页保存 2028 年假日后，已持久化义务是否自动全部重算。

## 证据

完整报告：[report.md](./report.md)

主要截图：[dashboard-agreement-obligation.png](./dashboard-agreement-obligation.png)、[annual-six-entities.png](./annual-six-entities.png)、[div7a-risk-and-schedule.png](./div7a-risk-and-schedule.png)、[assets-depreciation-cross-year.png](./assets-depreciation-cross-year.png)

证据数据库未加入 Git；旧 Gate 目录未修改。
