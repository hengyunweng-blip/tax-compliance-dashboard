# Backlog

## ATO article-page publication dates

- **Gate 5 non-blocking follow-up:** In the Gate 4 real ATO run, 38 of 100 fetched ATO items had `published_at = NULL` (38%). The current behavior intentionally marks those items as date unknown instead of guessing from the fetch date or list-page date. Later, investigate following article links and extracting the article's explicit original publication date; do not change the current no-guess behavior until that extraction is verified against real pages.
