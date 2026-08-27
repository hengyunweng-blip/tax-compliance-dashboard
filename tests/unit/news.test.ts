import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { analyseNewsItems, createTodoFromNewsAnalysis, dismissNewsItem, listNewsFeed } from "@/lib/news/analysis";
import { NEWS_FETCH_TIMEOUT_MS, refreshSource } from "@/lib/news/fetch";
import { getNewsWindowDays, setNewsWindowDays } from "@/lib/news/config";
import { matchedNewsKeywords, prescreenNewsItem } from "@/lib/news/prescreen";

const articleHtml = `
  <html><head><title>ATO GST activity statement update</title></head>
  <body><time datetime="2026-08-27">27 Aug 2026</time><h1>ATO GST activity statement update</h1>
  <p>Small businesses should review BAS and GST reporting.</p></body></html>
`;

const atoListPageHtml = `
  <script id="__NEXT_DATA__" type="application/json">
    {
      "searchHub": {
        "fields": { "key": { "value": "public-search-token" } },
        "name": "ATOGov SmallBusiness"
      },
      "organizationId": { "value": "ato-org" }
    }
  </script>
`;

const atoListResponse = {
  results: [{
    title: "Three reasons to lodge your trust tax return on time | Australian Taxation Office",
    printableUri: "/businesses-and-organisations/small-business-newsroom/three-reasons-to-lodge-your-trust-tax-return-on-time",
    excerpt: "Three reasons to lodge your trust tax return on time.",
    raw: { date: 1787623472000, dateupdated: 1787623472000 },
  }],
};

const asicListingHtml = `
  <span class="nh-list-date">20 August 2026</span>
  <h3 class="line-clamp"><a href="/about-asic/news-centre/news-items/example-one" class="nh-list-link">Example ASIC announcement</a></h3>
`;

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM news_todos; DELETE FROM news_analyses; DELETE FROM news_items;");
  getRawDb().prepare("UPDATE news_sources SET last_fetched_at = NULL, last_error = NULL").run();
  setNewsWindowDays(90);
  vi.unstubAllGlobals();
});

afterEach(() => {
  getRawDb().exec("DELETE FROM news_todos; DELETE FROM news_analyses; DELETE FROM news_items;");
  vi.unstubAllGlobals();
});

function sourceId(name: string) {
  return (getRawDb().prepare("SELECT id FROM news_sources WHERE name = ?").get(name) as { id: number }).id;
}

test("seeds the focused ATO and CAV listing sources and disables Treasury", () => {
  expect(getRawDb().prepare("SELECT url, fetch_type, active FROM news_sources WHERE name = ?").get("ATO 小企业资讯")).toEqual({
    url: "https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom",
    fetch_type: "html_listing_ato",
    active: 1,
  });
  expect(getRawDb().prepare("SELECT url, fetch_type, active FROM news_sources WHERE name = ?").get("Consumer Affairs Victoria 房产中介")).toEqual({
    url: "https://www.consumer.vic.gov.au/latest-news?Keyword=%7B131B3520-4AFE-4D3B-8967-E1781F982526%7D",
    fetch_type: "html_listing_cav",
    active: 1,
  });
  expect(getRawDb().prepare("SELECT active FROM news_sources WHERE name = ?").get("Treasury 政策发布")).toEqual({ active: 0 });
});

test("only tax-relevant news enters the pre-screen", () => {
  expect(prescreenNewsItem({ title: "ATO GST activity statement update", rawText: "BAS reporting" })).toBe(true);
  expect(prescreenNewsItem({ title: "Unrelated weather alert", rawText: "Heavy rain" })).toBe(false);
  expect(matchedNewsKeywords({ title: "Renting Taskforce update", rawText: "Underquoting checks for estate agencies" })).toEqual([
    "estate agencies",
    "renting taskforce",
    "underquoting",
  ]);
  expect(matchedNewsKeywords({ title: "Bass Hill investigation", rawText: "LRBAs are mentioned in the background only" })).toEqual([]);
});

test("one failed source records last_error while another source still stores an item", async () => {
  const failedSource = sourceId("Consumer Affairs Victoria 房产中介");
  const workingSource = sourceId("ATO 小企业资讯");
  await refreshSource(failedSource, async () => { throw new Error("source offline"); });
  await refreshSource(workingSource, async (input) => String(input).includes("coveo.com")
    ? new Response(JSON.stringify(atoListResponse), { status: 200 })
    : new Response(atoListPageHtml, { status: 200 }));

  expect(getRawDb().prepare("SELECT last_error FROM news_sources WHERE id = ?").get(failedSource)).toEqual({ last_error: "source offline" });
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM news_items WHERE source_id = ?").get(workingSource)).toEqual({ count: 1 });
});

test("a stalled source is aborted and records an isolated error", async () => {
  const source = sourceId("Consumer Affairs Victoria 房产中介");
  vi.useFakeTimers();
  try {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
    }));
    const refreshPromise = refreshSource(source, fetchMock);
    await vi.advanceTimersByTimeAsync(NEWS_FETCH_TIMEOUT_MS);
    await refreshPromise;

    expect(getRawDb().prepare("SELECT last_error FROM news_sources WHERE id = ?").get(source)).toEqual({ last_error: "request aborted" });
  } finally {
    vi.useRealTimers();
  }
});

test("successful source refresh is cached for 24 hours and content hash deduplicates", async () => {
  const fetchMock = vi.fn(async () => new Response(asicListingHtml, { status: 200 }));
  const source = sourceId("ASIC 公告");
  await refreshSource(source, fetchMock);
  await refreshSource(source, fetchMock);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM news_items WHERE source_id = ?").get(source)).toEqual({ count: 1 });
});

test("parses real-style ASIC listing entries instead of saving the navigation page title", async () => {
  const source = sourceId("ASIC 公告");
  const listing = `
    <span class="nh-list-date">20 August 2026</span>
    <h3 class="line-clamp"><a href="/about-asic/news-centre/news-items/example-one" class="nh-list-link">Example ASIC announcement</a></h3>
    <span class="nh-list-date">11 August 2026</span>
    <h3 class="line-clamp"><a href="https://www.asic.gov.au/about-asic/news-centre/news-items/example-two" class="nh-list-link">Second ASIC announcement</a></h3>
  `;

  await refreshSource(source, async () => new Response(listing, { status: 200 }));

  expect(getRawDb().prepare("SELECT title, published_at AS publishedAt, url FROM news_items WHERE source_id = ? ORDER BY id").all(source)).toEqual([
    { title: "Example ASIC announcement", publishedAt: "2026-08-20", url: "https://asic.gov.au/about-asic/news-centre/news-items/example-one" },
    { title: "Second ASIC announcement", publishedAt: "2026-08-11", url: "https://www.asic.gov.au/about-asic/news-centre/news-items/example-two" },
  ]);
});

test("parses the official ATO small business newsroom list through its public list-search configuration", async () => {
  const source = sourceId("ATO 小企业资讯");
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes("coveo.com")
    ? new Response(JSON.stringify(atoListResponse), { status: 200 })
    : new Response(atoListPageHtml, { status: 200 }));

  await refreshSource(source, fetchMock);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(getRawDb().prepare("SELECT title, published_at AS publishedAt, url FROM news_items WHERE source_id = ?").get(source)).toEqual({
    title: "Three reasons to lodge your trust tax return on time | Australian Taxation Office",
    publishedAt: "2026-08-25",
    url: "https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom/three-reasons-to-lodge-your-trust-tax-return-on-time",
  });
});

test("constrains ATO results to the configured newsroom and uses publication date", async () => {
  const source = sourceId("ATO 小企业资讯");
  const requestBodies: unknown[] = [];
  const response = {
    results: [
      {
        title: "Small business newsroom item",
        printableUri: "/businesses-and-organisations/small-business-newsroom/valid-item",
        raw: { date: 1785542400000, dateupdated: 1787623472000 },
      },
      {
        title: "Unrelated ATO item",
        printableUri: "/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/unrelated-item",
        raw: { date: 1787623472000, dateupdated: 1787623472000 },
      },
    ],
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("coveo.com")) {
      requestBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(response), { status: 200 });
    }
    return new Response(atoListPageHtml, { status: 200 });
  });

  await refreshSource(source, fetchMock);

  expect(requestBodies[0]).toMatchObject({ searchHub: "ATOGov SmallBusiness", q: "", sortCriteria: "dateupdated descending" });
  expect(getRawDb().prepare("SELECT title, published_at AS publishedAt, url FROM news_items WHERE source_id = ?").all(source)).toEqual([
    {
      title: "Small business newsroom item",
      publishedAt: "2026-08-01",
      url: "https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom/valid-item",
    },
  ]);
});

test("the main feed contains only recent keyword hits and returns the matched words", () => {
  const source = sourceId("ATO 小企业资讯");
  const insert = getRawDb().prepare("INSERT INTO news_items (source_id, title, url, published_at, raw_text, content_hash) VALUES (?, ?, ?, ?, ?, ?)");
  insert.run(source, "Recent BAS update", "https://example.test/recent", "2026-08-20", "GST reporting", "hash-recent");
  insert.run(source, "Recent general update", "https://example.test/general", "2026-08-20", "General policy announcement", "hash-general");
  insert.run(source, "Old BAS update", "https://example.test/old", "2026-01-20", "GST reporting", "hash-old");

  const items = listNewsFeed(false, new Date("2026-08-27T02:00:00.000Z"));

  expect(items.map((item) => item.title)).toEqual(["Recent BAS update"]);
  expect(items[0]?.matchedKeywords).toEqual(["gst", "bas"]);
});

test("the news window is a persisted setting with a 90-day default", () => {
  expect(getNewsWindowDays()).toBe(90);
  setNewsWindowDays(30);
  expect(getNewsWindowDays()).toBe(30);
  setNewsWindowDays(90);
});

test("analysis is persisted only for pre-screened items and a todo requires explicit confirmation", async () => {
  const source = sourceId("ATO 小企业资讯");
  const insert = getRawDb().prepare("INSERT INTO news_items (source_id, title, url, published_at, raw_text, content_hash) VALUES (?, ?, ?, ?, ?, ?)");
  insert.run(source, "ATO GST update", "https://example.test/gst", "2026-08-27", "GST BAS update", "hash-relevant");
  insert.run(source, "Weather alert", "https://example.test/weather", "2026-08-27", "Heavy rain", "hash-unrelated");

  await analyseNewsItems();
  const analyses = getRawDb().prepare("SELECT news_item_id FROM news_analyses ORDER BY news_item_id").all() as Array<{ news_item_id: number }>;
  expect(analyses).toHaveLength(1);

  const relevantAnalysisId = (getRawDb().prepare("SELECT id FROM news_analyses LIMIT 1").get() as { id: number }).id;
  await expect(createTodoFromNewsAnalysis(relevantAnalysisId)).rejects.toThrow(/确认/);
  const before = getRawDb().prepare("SELECT COUNT(*) AS count FROM obligations").get();
  const todo = await createTodoFromNewsAnalysis(relevantAnalysisId, true);
  const after = getRawDb().prepare("SELECT COUNT(*) AS count FROM obligations").get();
  expect(todo).toMatchObject({ newsAnalysisId: relevantAnalysisId, status: "todo" });
  expect(after).toEqual(before);
});

test("dismissal is persisted without deleting the original source item", async () => {
  const source = sourceId("ATO 小企业资讯");
  getRawDb().prepare("INSERT INTO news_items (source_id, title, url, published_at, raw_text, content_hash) VALUES (?, ?, ?, ?, ?, ?)").run(source, "ATO GST update", "https://example.test/gst", "2026-08-27", "GST BAS update", "hash-dismiss");
  const itemId = (getRawDb().prepare("SELECT id FROM news_items WHERE content_hash = 'hash-dismiss'").get() as { id: number }).id;
  await analyseNewsItems();
  await dismissNewsItem(itemId);

  expect(getRawDb().prepare("SELECT dismissed_at FROM news_analyses WHERE news_item_id = ?").get(itemId)).toMatchObject({ dismissed_at: expect.any(String) });
  expect((await listNewsFeed(true)).find((item) => item.id === itemId)?.dismissedAt).toEqual(expect.any(String));
});
