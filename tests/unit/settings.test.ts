import { expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { seedDatabase } from "@/lib/db/seed";
import { saveEntityConfiguration, saveSettings } from "@/lib/settings";
import { getEntityConfigurationStatus } from "@/lib/settings-status";

test("saving entity configuration survives a fresh database read", () => {
  seedDatabase();

  saveEntityConfiguration({
    entityId: "boyun_co",
    acn: "123456789",
    incorporationDate: "2024-07-15",
    asicReviewDate: "2026-07-15",
    gstRegistered: true,
    active: true,
  });

  const row = getRawDb()
    .prepare("SELECT acn, incorporation_date, asic_review_date, gst_registered FROM entities WHERE id = ?")
    .get("boyun_co") as {
    acn: string;
    incorporation_date: string;
    asic_review_date: string;
    gst_registered: number;
  };

  expect(row).toEqual({
    acn: "123456789",
    incorporation_date: "2024-07-15",
    asic_review_date: "2026-07-15",
    gst_registered: 1,
  });
});

test("rejects TFN input and never creates a TFN column", () => {
  seedDatabase();

  expect(() => saveEntityConfiguration({
    entityId: "self",
    tfn: "123456789",
  } as never)).toThrow(/TFN/);

  const columns = getRawDb()
    .prepare("PRAGMA table_info(entities)")
    .all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).not.toContain("tfn");
});

test("saves combined settings atomically", () => {
  seedDatabase();
  getRawDb().prepare("UPDATE entities SET acn = NULL WHERE id = ?").run("spouse");

  expect(() => saveSettings({
    entities: [{ entityId: "spouse", acn: "987654321" }],
    licence: { licenceId: 999, anniversaryDate: "2026-08-26" },
  })).toThrow(/Licence not found/);

  const row = getRawDb()
    .prepare("SELECT acn FROM entities WHERE id = ?")
    .get("spouse") as { acn: string | null };

  expect(row.acn).toBeNull();
});

test("individual and trust entities are never blocked by missing company identifiers", () => {
  expect(getEntityConfigurationStatus({ type: "individual", acn: null, asicReviewDate: null })).toBe("ready");
  expect(getEntityConfigurationStatus({ type: "trust", acn: null, asicReviewDate: null })).toBe("ready");
  expect(getEntityConfigurationStatus({ type: "company", acn: null, asicReviewDate: null })).toBe("blocked");
});
