# Gate 4 资讯模块修复提交

本次只处理 Gate 4 退回的资讯来源、陈旧内容和关键词筛选，不进入 Gate 5。

## 结果摘要

- ATO 已改为真实的 Small business newsroom 列表，`fetch_type = html_listing_ato`，通过该列表页当前公开的列表搜索配置请求条目；实际入库 100 条，`last_error = NULL`。
- CAV 已改为房产中介专题列表；实际入库 10 条，页面只显示房产/中介相关关键词命中项。
- Treasury 保留在 `news_sources`，但 `active = 0`，不再抓取或进入默认主列表。
- 主列表按 `published_at` 默认过滤近 90 天，并且只显示关键词预筛命中项；本次真实运行主列表 16 条。
- 每张资讯卡显示实际命中的关键词；日期展示为 `DD MMM YYYY`。
- 资讯窗口保存为 `settings.news_window_days`，默认 90，可在设置页调整。

## 代码与测试

重点变更位于：

- `lib/news/fetch.ts`：ATO 列表搜索解析、CAV 专题列表来源。
- `lib/news/config.ts`：90 天默认窗口和持久化设置。
- `lib/news/prescreen.ts`：命中词返回、英文词边界匹配。
- `lib/news/analysis.ts`：活动来源、日期窗口、命中项过滤。
- `components/news/news-card.tsx`：显示命中关键词。
- `config/ai.json`：移除 `ato`、`tax`、`asic`、`treasury` 等泛词，改用具体短语。

通过的测试：

```text
npm test -- --run tests/unit/news.test.ts tests/unit/settings.test.ts
Test Files  2 passed (2)
Tests       15 passed (15)
```

（测试文件中还覆盖了 ATO 列表解析、短词误命中防护、90 天窗口、预筛命中词返回、Treasury 停用和窗口设置持久化。）

## 运行证据

- [真实来源与筛选明细](./news-filtered-fetch-report.md)
- [实际 SQL 输出](./news-filtered-sql-output.txt)
- [真实资讯页面截图](./news-filtered-real-sources.png)
- [资讯窗口设置截图](./news-window-setting.png)

已验收 Gate 0–3 的证据文件未覆盖或删除；本次证据使用 Gate 4 独立文件名。
