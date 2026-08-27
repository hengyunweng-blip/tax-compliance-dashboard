import { getAiConfig } from "@/lib/ai/config";

export type NewsPrescreenInput = {
  title: string;
  rawText: string;
};

function keywordPattern(keyword: string) {
  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9-])${escaped}(?![a-z0-9])`);
}

export function matchedNewsKeywords(item: NewsPrescreenInput): string[] {
  const text = `${item.title} ${item.rawText}`.toLowerCase();
  return getAiConfig().keywords.filter((keyword) => keywordPattern(keyword).test(text));
}

export function matchedNewsExclusionKeywords(item: NewsPrescreenInput): string[] {
  const text = `${item.title} ${item.rawText}`.toLowerCase();
  return getAiConfig().excludedKeywords.filter((keyword) => keywordPattern(keyword).test(text));
}

export function isNewsExcludedByCurrentConfig(item: NewsPrescreenInput): boolean {
  return matchedNewsExclusionKeywords(item).length > 0;
}

export function prescreenNewsItem(item: NewsPrescreenInput) {
  return matchedNewsKeywords(item).length > 0;
}
