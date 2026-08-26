import { expect, test } from "vitest";
import { GET } from "@/app/api/health/route";

test("health route reports an available database", async () => {
  const response = await GET();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, database: "connected" });
});
