# Gate 4 runtime report

状态：Gate 4 实现、测试和运行证据已完成，等待用户验收；Gate 5 未开始。

## 1. 已关账期间补录安全阀

- `transactions` 增加 `belongs_to_closed_period`、`closed_period_worksheet_id` 和 `closed_period_resolution`。
- 所有交易通过 `createTransaction` 检查同一主体、同一季度 BAS 的 `lodged`/`paid` worksheet；命中后立即记录原 worksheet，不修改原底稿。
- Inbox 分为“已关账期间补录”和“普通待确认”两个独立区域。
- 生成下一期 BAS 时，未处理的补录交易会阻止生成并要求三选一：并入本期作为更正、标为待修订、排除并记录原因。每笔选择都写入 `audit_log`。
- 只有选择并入本期的交易进入新 worksheet 并锁定；原 Q1 worksheet 的金额、快照和状态不变。

单元测试：`tests/unit/closed-period-transactions.test.ts`，3 项通过。覆盖标记、独立 Inbox、无选择阻止生成、审计、并入新底稿和原 worksheet 不变。

运行 SQL 输出：[`closed-period-sql-output.txt`](./closed-period-sql-output.txt)。最终测试数据库中的关键结果：Q1 worksheet `#1` 仍为 `lodged` 且金额全为 0；补录交易 `#1` 指向原 worksheet `#1`，最终 `included_current` 并锁定；Q2 worksheet `#2` 才包含该交易。

运行截图：

- [`closed-period-inbox.png`](./closed-period-inbox.png)：补录交易单独显示在“已关账期间补录”区域，普通队列为 0。
- [`closed-period-q2-resolution.png`](./closed-period-q2-resolution.png)：选择并入本期后，交易出现在 Q2 底稿，原 Q1 不被重算。

## 2. AI 配置、脱敏和缓存

- `config/ai.json` 默认 `enabled: false`；关闭时四个适配器返回有类型的规则降级结果，并写入持久化 `ai_cache`。
- AI 启用的单元测试使用模拟 provider，输入同时包含 TFN、BSB/银行账号和完整地址；测试断言实际 provider request body 和 `ai_cache.redacted_input_json` 均不包含原值。
- 缓存键为脱敏 canonical JSON 的 SHA-256；API key 只从环境变量读取，不写日志或缓存。
- provider 超时、非 2xx、无效 JSON 或 schema 不匹配均降级；AI 结果没有写入 `transactions` 或 `obligations`。
- 资讯待办使用独立 `news_todos`，未传 `confirmed: true` 时拒绝；确认后只写待办和 `audit_log`，测试同时断言 obligations 数量不变。

测试文件：`tests/unit/ai-adapter.test.ts`，5 项通过。

## 3. 资讯模块与首屏边界

- `news_sources` seed 了 ATO、ASIC、Consumer Affairs Victoria 和 Treasury 四个官方来源。
- 外部抓取按来源并行、24 小时缓存并按 content hash 去重；单源失败只更新该来源的 `last_error`，其他来源仍可入库，缓存条目不删除。
- 关键词预筛命中后才进入分析；页面显示来源、发布日期和原文链接。
- Dashboard 首屏不读取资讯网络；`/api/news?refresh=1` 和“后台刷新”只启动后台 Promise，不等待外部来源。

测试文件：`tests/unit/news.test.ts`，5 项通过，包含单源失败隔离、缓存和去重、关键词预筛、忽略保留原文、确认创建待办。

## 4. 自动化浏览器验证

测试数据库：`./data/gate4-browser-final-2.db`，先执行 migrate/seed，再运行 Playwright。

```text
DATABASE_PATH=./data/gate4-browser-final-2.db npm run db:migrate    PASS
DATABASE_PATH=./data/gate4-browser-final-2.db npm run db:seed       PASS
CI=1 DATABASE_PATH=./data/gate4-browser-final-2.db npm run test:e2e -- tests/e2e/gate4-closed-period.spec.ts tests/e2e/gate4-ai-disabled.spec.ts
2 passed
```

AI 关闭流程检查 `/`、`/inbox`、`/import`、`/upload`、`/settings`、`/news`、一个义务详情页和一个 BAS 底稿页均返回 200；未向 ATO、ASIC、Consumer Affairs Victoria 或 Treasury 发出浏览器外部请求；页面显示“AI 已关闭”。

视觉证据：[`ai-disabled-news.png`](./ai-disabled-news.png)。

这只验证桌面浏览器和窄屏响应式边界，不声称已验证真实手机摄像头、手机拍照权限或手机上传流程。

## 5. 最终验证命令

```text
npm test       PASS — 23 files, 104 tests
npm run lint   PASS
npm run build  PASS — Next.js production build
```

此前 Gate 0、Gate 1、Gate 2、Gate 3 的证据目录未修改或删除；本 Gate 的截图和报告均位于 `docs/evidence/gate4/`。默认 `./data/app.db` 也已单独执行 migrate + seed 通过；`gate4-browser-final-2.db` 是本 Gate 的一次性运行证据数据库，不是应用默认读取路径。

## 6. 未进入范围

- 未开始 Gate 5，因此没有修改年度模块、Div 7A、养老金、备份还原或 ATO 官方 Div 7A 基准测试。
- 没有自动向 ATO/ASIC 提交；资讯原文仍需用户打开官方链接核对，AI 分析不能替代人工判断。
