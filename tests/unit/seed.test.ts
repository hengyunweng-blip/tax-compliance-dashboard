import { expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";

test("seed creates six entities and three GST-registered companies without obligations", () => {
  seedDatabase();

  const entities = getRawDb()
    .prepare("SELECT id, type, gst_registered FROM entities ORDER BY sort_order")
    .all() as Array<{ id: string; type: string; gst_registered: number }>;

  expect(entities.map((entity) => entity.id)).toEqual([
    "self",
    "spouse",
    "boyun_trust",
    "boyun_co",
    "yeeliving_co",
    "neighbourhood_co",
  ]);
  expect(entities.filter((entity) => entity.gst_registered === 1).map((entity) => entity.id)).toEqual([
    "boyun_co",
    "yeeliving_co",
    "neighbourhood_co",
  ]);
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM obligations").get()).toEqual({ count: 0 });
  expect(getRawDb().prepare("SELECT COUNT(*) AS count FROM obligation_rules").get()).toEqual({ count: 9 });
});
