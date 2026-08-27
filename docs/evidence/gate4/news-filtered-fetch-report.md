# Gate 4 资讯模块退回复核证据

运行日期：2026-08-27（Australia/Melbourne）  
证据数据库：`./data/gate4-news-real-20260827.db`（本次独立运行库）  
默认资讯窗口：90 天；本次固定验证时的 `published_at` 起点为 `2026-05-29`。

## 真实来源抓取结果

| 来源 | 配置 | 实际条数 | last_fetched_at | last_error |
| --- | --- | ---: | --- | --- |
| ATO 小企业资讯 | `html_listing_ato`；ATO Small business newsroom 列表 | 100 | `2026-08-27T00:09:46.223Z` | `NULL` |
| ASIC 公告 | `html_listing_asic`；ASIC newsroom 列表 | 4 | `2026-08-27T00:09:46.766Z` | `NULL` |
| Consumer Affairs Victoria 房产中介 | `html_listing_cav`；Buying and selling property 标签列表 | 10 | `2026-08-27T00:09:46.942Z` | `NULL` |
| Treasury 政策发布 | `html_listing_treasury`；`active = 0` | 0（按配置停用，未抓取） | `NULL` | `NULL` |

ATO 使用的真实列表地址是 [ATO Small business newsroom](https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom)，不是单篇文章。CAV 使用房产中介专题列表参数，来源地址为 [Consumer Affairs Victoria Buying and selling property list](https://www.consumer.vic.gov.au/latest-news?Keyword=%7B131B3520-4AFE-4D3B-8967-E1781F982526%7D)。Treasury 的记录保留在 `news_sources`，但因当前媒体发布内容与申报义务无关，设为停用，不进入默认来源或主列表。

## ATO 实际抓取前 5 条

| # | 标题 | 日期 |
| ---: | --- | --- |
| 1 | Small business tax questions answered by joining ATO Community | 07 Aug 2026 |
| 2 | Did you miss the final quarterly super payment? | 06 Aug 2026 |
| 3 | Paying super for independent contactors | 05 Aug 2026 |
| 4 | Does your payroll provider support Payday Super? | 04 Aug 2026 |
| 5 | Top tips to meet the Payday Super 7 business day timeframe | 03 Aug 2026 |

完整的 `SELECT source_id, title, published_at, url FROM news_items LIMIT 10;` 实际输出见 [news-filtered-sql-output.txt](./news-filtered-sql-output.txt)。

## 真实条目预筛

主列表先按 `published_at >= 2026-05-29`，再按收紧后的关键词做边界匹配；本次 114 条活动来源缓存中，主列表命中 **16 条**。旧条目仍可留在来源缓存用于追溯，但不进入“相关资讯”主列表；例如 2026 年 4 月的 CAV 条目没有显示。

收紧后的关键词为：`business activity statement`、`gst`、`bas`、`payg instalment`、`division 7a`、`tax return`、`superannuation`、`annual review`、`company annual review`、`estate agent`、`estate agents`、`estate agency`、`estate agencies`、`renting taskforce`、`underquoting`、`agents' representative`、`trust account`、`vcat`。短词使用英文边界匹配，避免 `BAS` 命中 `Bass` 或 `LRBAs`。

| 来源 | `published_at` | 标题 | 命中词 |
| --- | --- | --- | --- |
| ASIC 公告 | 20 Aug 2026 | Superannuation and whole-of-business retirement | `superannuation` |
| ATO 小企业资讯 | 03 Aug 2026 | Are you a provider under the Government Payments Program? | `tax return` |
| ATO 小企业资讯 | 03 Aug 2026 | Fuel tax credit rates have changed again on 3 August | `bas` |
| ATO 小企业资讯 | 03 Aug 2026 | New guidance on Renewable Energy compensation payments | `gst` |
| Consumer Affairs Victoria 房产中介 | 24 Jul 2026 | Melbourne’s inner north targeted in winter auction compliance checks | `estate agents`, `underquoting` |
| Consumer Affairs Victoria 房产中介 | 18 Jul 2026 | Estate agency and representatives accused of rampant underquoting | `estate agents`, `estate agency`, `underquoting` |
| Consumer Affairs Victoria 房产中介 | 17 Jul 2026 | Estate agency facing court and VCAT over alleged rental failures | `estate agents`, `estate agency`, `vcat` |
| Consumer Affairs Victoria 房产中介 | 09 Jul 2026 | Agencies fined following Renting Taskforce investigation | `estate agents`, `estate agencies`, `renting taskforce` |
| ATO 小企业资讯 | 08 Jul 2026 | Stronger action on over-claimed expenses and GST credits | `gst` |
| ATO 小企业资讯 | 02 Jul 2026 | New TPAR pre-fill for tax time 2026 | `tax return` |
| ATO 小企业资讯 | 02 Jul 2026 | Use reduced rates for fuel tax credits on your quarter 4 BAS | `bas` |
| Consumer Affairs Victoria 房产中介 | 17 Jun 2026 | Essendon agent convicted for mishandling client money | `estate agent`, `estate agents` |
| Consumer Affairs Victoria 房产中介 | 03 Jun 2026 | Estate agent Mark Reuben sentenced for unlicensed trading | `estate agent`, `estate agents` |
| ATO 小企业资讯 | 03 Jun 2026 | How to report all income you earn online when you lodge | `tax return` |
| ATO 小企业资讯 | 03 Jun 2026 | Have your say on the future of GST – join the GST Stewardship Group! | `gst` |
| ATO 小企业资讯 | 02 Jun 2026 | Use our calculator to help claim the right fuel tax credits | `bas` |

页面截图 [news-filtered-real-sources.png](./news-filtered-real-sources.png) 显示真实来源条目、`DD MMM YYYY` 日期、命中关键词和原文链接；页面标题旁显示“近 90 天 · 16 条命中”，不会再显示未命中的 25 条全量内容。资讯窗口的持久化设置截图为 [news-window-setting.png](./news-window-setting.png)。
