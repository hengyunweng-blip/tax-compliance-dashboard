# Gate 4 资讯模块复验提交

本次只处理 Gate 4 退回的资讯来源、陈旧内容和关键词筛选，并补强 ATO 列表边界与抓取超时；不进入 Gate 5。

## 结果摘要

- ATO 已改为真实的 [Small business newsroom 列表](https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom)，`fetch_type = html_listing_ato`。实现使用该页公开的列表搜索配置提交 `ATOGov SmallBusiness` 查询，并只接受该 newsroom 路径的结果；本次真实入库 100 条，`last_error = NULL`。
- CAV 已改为 [Buying and selling property 专题列表](https://www.consumer.vic.gov.au/latest-news?Keyword=%7B131B3520-4AFE-4D3B-8967-E1781F982526%7D)，本次真实入库 10 条，优先覆盖房产中介/专业人士内容。
- Treasury 保留在 `news_sources`，但 `active = 0`，不再进入默认来源或主列表。
- 主列表按 `published_at` 默认过滤近 90 天，并且只显示收紧关键词命中项；本次真实运行 114 条缓存中有 33 条命中。每张卡显示实际命中的关键词。
- 抓取请求统一有 15 秒超时，单源失败只更新该来源的 `last_error`，不会阻塞首屏。
- `news_window_days` 默认 90，已通过设置页保存为 90、页面重载读回 90；证据截图为 [news-window-setting-v2.png](./news-window-setting-v2.png)。

## 真实运行证据

- [真实来源、ATO 前五条与 33 条命中明细](./news-filtered-fetch-report-v2.md)
- [实际 SQL 输出](./news-filtered-sql-output-v2.txt)
- [真实资讯页面截图](./news-filtered-real-sources-v2.png)
- [窗口设置持久化截图](./news-window-setting-v2.png)

截图中只展示 3 个活动来源；Treasury 仍保留在数据库中但已停用，因此不会伪装成“尚未刷新”的活动来源。

## 代码与测试

重点变更位于：

- `lib/news/fetch.ts`：ATO 页面 JSON 配置解析、`ATOGov SmallBusiness` search hub、严格 newsroom URL 过滤、出版日期优先和 15 秒超时。
- `lib/news/config.ts`：90 天默认窗口和持久化设置。
- `lib/news/prescreen.ts`：命中词返回、英文词边界匹配。
- `lib/news/analysis.ts`：活动来源、发布日期窗口和命中项过滤。
- `components/news/news-card.tsx`：显示命中关键词。
- `config/ai.json`：移除泛词，改用具体税务、公司年审和房产中介词。

本轮新增/调整测试覆盖：

- ATO 列表配置字段顺序变化仍可解析；请求体包含 `ATOGov SmallBusiness`；非 newsroom ATO 路径不入库。
- ATO 使用 publication date，而不是最近编辑时间作为 `published_at`。
- 卡住的来源会被取消并写入 `last_error`。
- 无效资讯窗口通过 `/api/settings` 返回 HTTP 400。

验证结果：

```text
目标测试：2 个测试文件、18 个测试通过
全量测试：25 个测试文件、119 个测试通过
npm run lint：通过
npm run build：通过
```

本次新增的 v2 证据文件没有修改或删除 Gate 0–3 已验收证据；当前没有创建 `gate-4` 标签，等待 Gate 4 验收后再标记。Gate 5（包括 Div 7A 官方计算器基准）尚未开始。
