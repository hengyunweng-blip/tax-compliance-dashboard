# Gate 4 real-source fetch evidence

- Run date (Melbourne): 27 Aug 2026
- Database: `./data/gate4-return-final.db`
- Method: seeded the application, cleared only the evidence database's news item/analysis rows, then called the production `refreshSource` path once per source and ran the production keyword pre-screen.
- All four requests were real HTTPS requests to the configured official URLs. No mock provider or fixture was used in this run.

| Source | `fetch_type` | URL | Result | Inserted | `last_error` |
| --- | --- | --- | ---: | ---: | --- |
| ATO 小企业资讯 | `html_article` | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/managing-gst-in-your-business/reporting-paying-and-activity-statements/correcting-gst-errors | success | 1 | `NULL` |
| ASIC 公告 | `html_listing_asic` | https://asic.gov.au/newsroom/ | success | 4 | `NULL` |
| Consumer Affairs Victoria 房产中介 | `html_listing_cav` | https://www.consumer.vic.gov.au/latest-news | success | 10 | `NULL` |
| Treasury 政策发布 | `html_listing_treasury` | https://treasury.gov.au/media-release | success | 10 | `NULL` |

The database contained 25 real news items after the run. The production keyword pre-screen matched 15 of the 25 items. The first ten rows from `SELECT source_id, title, published_at, url FROM news_items LIMIT 10;` are in [real-news-sql-output.txt](./real-news-sql-output.txt).

The listing parsers were source-specific: ASIC extracts its direct newsroom links and `nh-list-date`, Consumer Affairs Victoria extracts `/latest-news/` cards and their visible dates, and Treasury extracts `/media-release/` links plus `<time datetime>`. This is why the stored URLs are article links rather than the listing page URL.
