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
  expect(getRawDb().prepare(`
    SELECT id, adjustment_direction
    FROM obligation_rules
    WHERE id IN ('trust_distribution_resolution', 'estate_agent_licence_annual_statement', 'super_contribution')
    ORDER BY id
  `).all()).toEqual([
    { id: "estate_agent_licence_annual_statement", adjustment_direction: "backward" },
    { id: "super_contribution", adjustment_direction: "backward" },
    { id: "trust_distribution_resolution", adjustment_direction: "backward" },
  ]);
});

test("seeds required fields per obligation rule instead of per entity", () => {
  const rows = getRawDb().prepare(`
    SELECT id, required_fields
    FROM obligation_rules
    WHERE id IN ('bas_quarterly', 'company_tax_return', 'asic_annual_review')
    ORDER BY id
  `).all() as Array<{ id: string; required_fields: string }>;

  expect(rows).toEqual([
    { id: "asic_annual_review", required_fields: '["asic_review_date"]' },
    { id: "bas_quarterly", required_fields: "[]" },
    { id: "company_tax_return", required_fields: "[]" },
  ]);
});
