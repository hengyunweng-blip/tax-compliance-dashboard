# Gate 4 资讯模块退回复核证据（ATO 列表边界加固后）

运行日期：2026-08-27（Australia/Melbourne）  
证据数据库：`./data/gate4-news-real-20260827-v2.db`（本次独立运行库）  
抓取时间参数：`2026-08-27T00:09:46.000Z`；默认窗口起点：`2026-05-29`。

## 真实来源抓取结果

| 来源 | 配置 | 实际入库条数 | `last_fetched_at` | `last_error` |
| --- | --- | ---: | --- | --- |
| ATO 小企业资讯 | `html_listing_ato`；Small business newsroom 列表，使用页面公开的 `ATOGov SmallBusiness` 列表搜索配置 | 100 | `2026-08-27T00:09:46.000Z` | `NULL` |
| ASIC 公告 | `html_listing_asic`；ASIC newsroom 列表 | 4 | `2026-08-27T00:09:46.000Z` | `NULL` |
| Consumer Affairs Victoria 房产中介 | `html_listing_cav`；Buying and selling property 标签列表 | 10 | `2026-08-27T00:09:46.000Z` | `NULL` |
| Treasury 政策发布 | `html_listing_treasury`；保留记录但 `active = 0` | 0（按配置停用，未抓取） | `NULL` | `NULL` |

ATO 使用真实的 [Small business newsroom 列表](https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom)，不是单篇文章。实现从该页的公开 JSON 配置读取组织、列表搜索 hub 和搜索凭据，结果只接受 `www.ato.gov.au/businesses-and-organisations/small-business-newsroom[/...]` 路径，其他 ATO 路径不会入库。CAV 使用 [Consumer Affairs Victoria Buying and selling property 列表](https://www.consumer.vic.gov.au/latest-news?Keyword=%7B131B3520-4AFE-4D3B-8967-E1781F982526%7D)。Treasury 的 `news_sources` 记录保留，但因当前内容与本系统申报义务无关而停用。

## ATO 实际抓取前 5 条

| # | 标题 | `published_at` |
| ---: | --- | --- |
| 1 | Small business tax questions answered by joining ATO Community \| Australian Taxation Office | 07 Aug 2026 |
| 2 | Did you miss the final quarterly super payment? \| Australian Taxation Office | 06 Aug 2026 |
| 3 | Paying super for independent contactors \| Australian Taxation Office | 05 Aug 2026 |
| 4 | Does your payroll provider support Payday Super? \| Australian Taxation Office | 05 Aug 2026 |
| 5 | Top tips to meet the Payday Super 7 business day timeframe \| Australian Taxation Office | 03 Aug 2026 |

实际 `SELECT source_id, title, published_at, url FROM news_items LIMIT 10;` 输出见 [news-filtered-sql-output-v2.txt](./news-filtered-sql-output-v2.txt)。

## 真实条目预筛结果

本次生产路径先按 `published_at >= 2026-05-29`，再按关键词边界匹配。缓存共 114 条，其中 6 条早于窗口；活动来源窗口内 108 条，主列表命中 **33 条**。主列表只返回这 33 条，旧条目不会显示。

收紧后的关键词为：`business activity statement`、`gst`、`bas`、`payg instalment`、`division 7a`、`tax return`、`superannuation`、`annual review`、`company annual review`、`estate agent`、`estate agents`、`estate agency`、`estate agencies`、`renting taskforce`、`underquoting`、`agents' representative`、`trust account`、`vcat`。短词使用英文边界匹配，避免 `BAS` 命中 `Bass` 或 `LRBAs`。

下表是本次真实运行主列表的全部 33 条及每条实际命中词：

| # | 来源 | `published_at` | 标题 | 命中词 |
| ---: | --- | --- | --- | --- |
| 1 | ASIC 公告 | 20 Aug 2026 | Superannuation and whole-of-business retirement | `superannuation` |
| 2 | ATO 小企业资讯 | 04 Aug 2026 | New guidance on Renewable Energy compensation payments \| Australian Taxation Office | `gst` |
| 3 | ATO 小企业资讯 | 03 Aug 2026 | Start looking now for alternative providers to the SBSCH \| Australian Taxation Office | `superannuation` |
| 4 | ATO 小企业资讯 | 03 Aug 2026 | Are you a provider under the Government Payments Program? \| Australian Taxation Office | `tax return` |
| 5 | ATO 小企业资讯 | 03 Aug 2026 | Fuel tax credit rates have changed again on 3 August \| Australian Taxation Office | `bas` |
| 6 | Consumer Affairs Victoria 房产中介 | 24 Jul 2026 | Melbourne’s inner north targeted in winter auction compliance checks | `estate agents`, `underquoting` |
| 7 | Consumer Affairs Victoria 房产中介 | 18 Jul 2026 | Estate agency and representatives accused of rampant underquoting | `estate agents`, `estate agency`, `underquoting` |
| 8 | Consumer Affairs Victoria 房产中介 | 17 Jul 2026 | Estate agency facing court and VCAT over alleged rental failures | `estate agents`, `estate agency`, `vcat` |
| 9 | ATO 小企业资讯 | 14 Jul 2026 | Payday Super is now law \| Australian Taxation Office | `superannuation` |
| 10 | ATO 小企业资讯 | 14 Jul 2026 | Get ready for the SBSCH closure \| Australian Taxation Office | `superannuation` |
| 11 | Consumer Affairs Victoria 房产中介 | 09 Jul 2026 | Agencies fined following Renting Taskforce investigation | `estate agents`, `estate agencies`, `renting taskforce` |
| 12 | ATO 小企业资讯 | 08 Jul 2026 | Use reduced rates for fuel tax credits on your quarter 4 BAS \| Australian Taxation Office | `bas` |
| 13 | ATO 小企业资讯 | 08 Jul 2026 | Stronger action on over-claimed expenses and GST credits \| Australian Taxation Office | `gst` |
| 14 | ATO 小企业资讯 | 03 Jul 2026 | New TPAR pre-fill for tax time 2026 \| Australian Taxation Office | `tax return` |
| 15 | Consumer Affairs Victoria 房产中介 | 17 Jun 2026 | Essendon agent convicted for mishandling client money | `estate agent`, `estate agents` |
| 16 | ATO 小企业资讯 | 04 Jun 2026 | Are you applying GST correctly for vouchers? \| Australian Taxation Office | `gst` |
| 17 | ATO 小企业资讯 | 04 Jun 2026 | Tax time 2025 is nearly over \| Australian Taxation Office | `tax return` |
| 18 | ATO 小企业资讯 | 04 Jun 2026 | We have more time to notify of retained BAS refunds \| Australian Taxation Office | `bas` |
| 19 | ATO 小企业资讯 | 04 Jun 2026 | It’s almost BAS time! \| Australian Taxation Office | `business activity statement`, `bas` |
| 20 | ATO 小企业资讯 | 04 Jun 2026 | Business expenses: Know what you can (and can't) claim \| Australian Taxation Office | `tax return` |
| 21 | ATO 小企业资讯 | 04 Jun 2026 | Do you sell waterproof bedding or burns products? \| Australian Taxation Office | `gst` |
| 22 | ATO 小企业资讯 | 04 Jun 2026 | Need to update your business tax return? \| Australian Taxation Office | `tax return` |
| 23 | ATO 小企业资讯 | 04 Jun 2026 | SPF and GST: guidance on our approach to sunscreen products \| Australian Taxation Office | `gst` |
| 24 | ATO 小企业资讯 | 04 Jun 2026 | Check your GST registration as the year wraps up \| Australian Taxation Office | `gst` |
| 25 | ATO 小企业资讯 | 04 Jun 2026 | Business or private? Check your GST credit claims \| Australian Taxation Office | `gst`, `bas` |
| 26 | ATO 小企业资讯 | 04 Jun 2026 | Do you provide services via the government payments program? \| Australian Taxation Office | `superannuation` |
| 27 | ATO 小企业资讯 | 04 Jun 2026 | Make BAS time easier following our 3 tips \| Australian Taxation Office | `gst`, `bas` |
| 28 | ATO 小企业资讯 | 04 Jun 2026 | Get the low down on downloading your SBSCH records \| Australian Taxation Office | `superannuation` |
| 29 | ATO 小企业资讯 | 04 Jun 2026 | Haven't lodged your March quarterly BAS yet? You may still have time \| Australian Taxation Office | `bas` |
| 30 | ATO 小企业资讯 | 04 Jun 2026 | Use our calculator to help claim the right fuel tax credits \| Australian Taxation Office | `bas` |
| 31 | ATO 小企业资讯 | 04 Jun 2026 | How to report all income you earn online when you lodge \| Australian Taxation Office | `tax return` |
| 32 | ATO 小企业资讯 | 04 Jun 2026 | Have your say on the future of GST – join the GST Stewardship Group! \| Australian Taxation Office | `gst` |
| 33 | Consumer Affairs Victoria 房产中介 | 03 Jun 2026 | Estate agent Mark Reuben sentenced for unlicensed trading | `estate agent`, `estate agents` |

截图 [news-filtered-real-sources-v2.png](./news-filtered-real-sources-v2.png) 显示了真实来源卡片、`DD MMM YYYY` 日期、命中关键词及“打开原文”链接；页面标题显示“近 90 天 · 33 条命中”。
