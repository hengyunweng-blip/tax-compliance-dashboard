import { aiStatusLabel, isAiEnabled } from "@/lib/ai/config";
import { createTodoFromNewsAnalysis, dismissNewsItem, listNewsFeed, analyseNewsItems } from "@/lib/news/analysis";
import { refreshNewsInBackground } from "@/lib/news/fetch";
import { listNewsSources } from "@/lib/news/sources";
import { runMigrations } from "@/lib/db/migrate";

export const dynamic = "force-dynamic";

function responsePayload(includeDismissed = false) {
  return { items: listNewsFeed(includeDismissed), sources: listNewsSources(), aiEnabled: isAiEnabled(), aiStatus: aiStatusLabel() };
}

export async function GET(request: Request) {
  try {
    runMigrations();
    const url = new URL(request.url);
    const includeDismissed = url.searchParams.get("includeDismissed") === "1";
    if (url.searchParams.get("refresh") === "1") {
      void refreshNewsInBackground().then(() => analyseNewsItems()).catch(() => undefined);
    }
    return Response.json(responsePayload(includeDismissed));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "资讯暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: "refresh" | "dismiss" | "create_todo" | "analyse"; newsItemId?: number; newsAnalysisId?: number; confirmed?: boolean };
    if (body.action === "refresh") {
      void refreshNewsInBackground().then(() => analyseNewsItems()).catch(() => undefined);
      return Response.json({ ...responsePayload(), refresh: "started" }, { status: 202 });
    }
    if (body.action === "analyse") {
      await analyseNewsItems();
      return Response.json(responsePayload());
    }
    if (body.action === "dismiss" && Number.isSafeInteger(body.newsItemId)) {
      await dismissNewsItem(body.newsItemId as number);
      return Response.json(responsePayload());
    }
    if (body.action === "create_todo" && Number.isSafeInteger(body.newsAnalysisId)) {
      const todo = await createTodoFromNewsAnalysis(body.newsAnalysisId as number, body.confirmed === true);
      return Response.json({ ...responsePayload(true), todo }, { status: 201 });
    }
    return Response.json({ error: "无效的资讯操作" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "资讯操作失败" }, { status: 400 });
  }
}
