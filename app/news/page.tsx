import { aiStatusLabel, isAiEnabled } from "@/lib/ai/config";
import { NewsPageClient } from "@/components/news/news-page-client";
import { listNewsFeed } from "@/lib/news/analysis";
import { getNewsWindowDays } from "@/lib/news/config";
import { listNewsSources } from "@/lib/news/sources";
import { runMigrations } from "@/lib/db/migrate";

export const dynamic = "force-dynamic";

export default function NewsPage() {
  runMigrations();
  return <NewsPageClient initialItems={listNewsFeed()} initialSources={listNewsSources()} initialWindowDays={getNewsWindowDays()} aiEnabled={isAiEnabled()} aiStatus={aiStatusLabel()} />;
}
