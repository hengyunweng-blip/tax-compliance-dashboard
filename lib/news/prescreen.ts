import { getAiConfig } from "@/lib/ai/config";

export type NewsPrescreenInput = {
  title: string;
  rawText: string;
};

export function prescreenNewsItem(item: NewsPrescreenInput) {
  const text = `${item.title} ${item.rawText}`.toLowerCase();
  return getAiConfig().keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}
