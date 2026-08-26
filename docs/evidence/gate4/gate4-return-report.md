# Gate 4 re-submission report

Status: implementation complete; awaiting Gate 4 acceptance. Gate 5 has not started.

## Real news sources

All four configured official endpoints were fetched through the production source refresh path on 27 Aug 2026 (Melbourne time). The result table, parser type, inserted counts, and `last_error` values are in [news-real-fetch-report.md](./news-real-fetch-report.md). The actual SQL output requested for `news_items` is in [real-news-sql-output.txt](./real-news-sql-output.txt).

The browser evidence [news-real-sources.png](./news-real-sources.png) shows the cached results on `/news`, including real titles, fixed `DD MMM YYYY` dates, and direct original links. The page shows 25 items and all four sources as successfully refreshed. The source-specific run produced 25 items total; 15 matched the production keyword pre-screen.

## Prior-period correction evidence

Q2 contains the 05 Jul 2026 transaction that belongs to FY2026–27 Q1. The browser evidence [bas-prior-period-correction.png](./bas-prior-period-correction.png) shows:

- `本期含 1 笔前期更正，合计 $1,100.00，原属期间 FY2026–27 Q1`;
- the transaction row tagged `前期更正`;
- the original period `FY2026–27 Q1` and original worksheet `#1`;
- the unchanged Q2/Q1 worksheet relationship and fixed date display.

The generated CSV and PDF extraction are preserved separately in [bas-prior-period-correction-csv.txt](./bas-prior-period-correction-csv.txt) and [bas-prior-period-correction-pdf.txt](./bas-prior-period-correction-pdf.txt). The PDF uses the existing ASCII-safe PDF font, so its equivalent summary is emitted in English while the UI and CSV contain the requested Chinese wording.

## GST correction policy guard

The implementation records the policy constants and retrieval date in `lib/domain/bas/gst-correction-policy.ts`:

- GST turnover band: `< $20m`;
- net debit GST error must be strictly less than `$12,500`;
- debit error must be corrected within 18 months after the original due date;
- credit corrections use the ATO period-of-review guard (four years plus one day in the implementation, with the original lodged date when available).

Source checked on 27 Aug 2026: [ATO Correcting GST errors](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/managing-gst-in-your-business/reporting-paying-and-activity-statements/correcting-gst-errors), [ATO Legislative Determination LI 2023/32](https://www.ato.gov.au/law/view/pdf/ldt/li2023-032.pdf), and [ATO period of review](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/managing-gst-in-your-business/reporting-paying-and-activity-statements/period-of-review).

At or above the value cap, or after the time limit, `include_current` is rejected before writing a new worksheet or resolving the late transaction. The UI leaves `标为待修订` available and explains that the original BAS must be revised. The original lodged worksheet is never mutated.

## Verification

- `npm test -- --run tests/unit/bas-correction-policy.test.ts tests/unit/bas-export.test.ts tests/unit/closed-period-transactions.test.ts`: passed (9 tests).
- `npm test -- --run tests/unit/news.test.ts`: passed (6 tests).
- Browser runtime: `/news` and `/bas/8` were loaded from the application on port 3010 using the evidence database; DOM assertions confirmed real source titles/dates/links and the correction summary/metadata.
- Existing Gate 4 AI-disabled and closed-period evidence remains unchanged. No automatic AI result is written to `transactions` or `obligations`.
