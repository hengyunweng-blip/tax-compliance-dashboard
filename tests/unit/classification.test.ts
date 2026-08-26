import { expect, test } from "vitest";
import { classifyTransaction } from "@/lib/rules/classification";

test("classifies a common commission supplier with a deterministic fallback", () => {
  expect(classifyTransaction({ description: "Realestate commission" }, { entityId: "boyun_co" })).toMatchObject({
    accountCode: "400",
    gstCode: "GST_INCOME",
  });
});

test("marks unknown descriptions for human review instead of inventing a confident account", () => {
  expect(classifyTransaction({ description: "Unknown counterparty" }, { entityId: "boyun_co" })).toMatchObject({
    confidence: "low",
    reviewFlag: true,
  });
});
