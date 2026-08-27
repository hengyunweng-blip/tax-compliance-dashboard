import { z } from "zod";
import { getRawDb } from "@/lib/db/client";
import {
  NEWS_IRRELEVANT_TOPIC_EXCLUSION_SETTING_KEY,
  NEWS_WINDOW_SETTING_KEY,
  parseNewsWindowDays,
  setNewsIrrelevantTopicExclusionEnabled,
} from "@/lib/news/config";
import type { DateOnly } from "@/lib/time/melbourne";

const entityConfigurationSchema = z.object({
  entityId: z.string().min(1),
  acn: z.string().trim().max(20).nullable().optional(),
  incorporationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  asicReviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gstRegistered: z.boolean().optional(),
  active: z.boolean().optional(),
}).strict();

const licenceConfigurationSchema = z.object({
  licenceId: z.number().int().positive(),
  licenceNumber: z.string().trim().max(80).nullable().optional(),
  anniversaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict();

const newsWindowDaysSchema = z.number().int().min(1).max(3650);

export type EntityConfigurationInput = z.input<typeof entityConfigurationSchema>;
export type LicenceConfigurationInput = z.input<typeof licenceConfigurationSchema>;

export type SettingsEntity = {
  id: string;
  name: string;
  type: string;
  acn: string | null;
  incorporationDate: DateOnly | null;
  asicReviewDate: DateOnly | null;
  gstRegistered: boolean;
  active: boolean;
  basCycle: string;
};

export type SettingsLicence = {
  id: number;
  holder: string;
  type: string;
  licenceNumber: string | null;
  anniversaryDate: DateOnly | null;
  regulator: string;
  portalUrl: string;
  lodgementWindowWeeks: number;
};

export type SettingsSnapshot = {
  entities: SettingsEntity[];
  licence: SettingsLicence | null;
  settings: Record<string, string>;
};

function rejectTfn(input: unknown) {
  if (typeof input === "object" && input !== null && "tfn" in input) {
    throw new Error("TFN 不得入库");
  }
}

function nullableValue(value: string | null | undefined) {
  return value === undefined || value === null || value.trim() === "" ? null : value.trim();
}

function parseEntityConfiguration(input: unknown) {
  rejectTfn(input);
  return entityConfigurationSchema.parse(input);
}

function parseLicenceConfiguration(input: unknown) {
  rejectTfn(input);
  return licenceConfigurationSchema.parse(input);
}

type Database = ReturnType<typeof getRawDb>;

function applyEntityConfigurations(db: Database, parsed: Array<z.infer<typeof entityConfigurationSchema>>) {
  const select = db.prepare("SELECT acn, incorporation_date, asic_review_date, gst_registered, active FROM entities WHERE id = ?");
  const update = db.prepare(`
    UPDATE entities
    SET acn = ?, incorporation_date = ?, asic_review_date = ?, gst_registered = ?, active = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const item of parsed) {
    const current = select.get(item.entityId) as {
      acn: string | null;
      incorporation_date: string | null;
      asic_review_date: string | null;
      gst_registered: number;
      active: number;
    } | undefined;
    if (!current) {
      throw new Error(`Entity not found: ${item.entityId}`);
    }

    update.run(
      item.acn === undefined ? current.acn : nullableValue(item.acn),
      item.incorporationDate === undefined ? current.incorporation_date : nullableValue(item.incorporationDate),
      item.asicReviewDate === undefined ? current.asic_review_date : nullableValue(item.asicReviewDate),
      item.gstRegistered === undefined ? current.gst_registered : Number(item.gstRegistered),
      item.active === undefined ? current.active : Number(item.active),
      item.entityId,
    );
  }
}

function applyLicenceConfiguration(db: Database, parsed: z.infer<typeof licenceConfigurationSchema>) {
  const select = db.prepare("SELECT licence_number, anniversary_date FROM licences WHERE id = ?");
  const current = select.get(parsed.licenceId) as {
    licence_number: string | null;
    anniversary_date: string | null;
  } | undefined;
  if (!current) {
    throw new Error(`Licence not found: ${parsed.licenceId}`);
  }

  db.prepare(`
    UPDATE licences
    SET licence_number = ?, anniversary_date = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    parsed.licenceNumber === undefined ? current.licence_number : nullableValue(parsed.licenceNumber),
    parsed.anniversaryDate === undefined ? current.anniversary_date : nullableValue(parsed.anniversaryDate),
    parsed.licenceId,
  );
}

export function saveEntityConfiguration(input: unknown): SettingsEntity {
  const parsed = parseEntityConfiguration(input);
  saveEntityConfigurations([parsed]);
  const entity = getSettingsSnapshot().entities.find((item) => item.id === parsed.entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${parsed.entityId}`);
  }
  return entity;
}

export function saveEntityConfigurations(inputs: unknown[]) {
  const parsed = inputs.map(parseEntityConfiguration);
  const db = getRawDb();
  const transaction = db.transaction(() => {
    applyEntityConfigurations(db, parsed);
  });
  transaction();
}

export function saveLicenceConfiguration(input: unknown): SettingsLicence {
  const parsed = parseLicenceConfiguration(input);
  const db = getRawDb();
  const transaction = db.transaction(() => {
    applyLicenceConfiguration(db, parsed);
  });
  transaction();

  const licence = getSettingsSnapshot().licence;
  if (!licence) {
    throw new Error(`Licence not found: ${parsed.licenceId}`);
  }
  return licence;
}

export function saveSettings(input: unknown) {
  rejectTfn(input);
  const parsed = z.object({
    entities: z.array(entityConfigurationSchema).optional(),
    licence: licenceConfigurationSchema.optional(),
    newsWindowDays: newsWindowDaysSchema.optional(),
    excludeIrrelevantTopics: z.boolean().optional(),
  }).strict().parse(input);

  const db = getRawDb();
  const transaction = db.transaction(() => {
    if (parsed.entities) {
      applyEntityConfigurations(db, parsed.entities);
    }
    if (parsed.licence) {
      applyLicenceConfiguration(db, parsed.licence);
    }
    if (parsed.newsWindowDays !== undefined) {
      const days = parseNewsWindowDays(parsed.newsWindowDays);
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `).run(NEWS_WINDOW_SETTING_KEY, String(days));
    }
    if (parsed.excludeIrrelevantTopics !== undefined) {
      setNewsIrrelevantTopicExclusionEnabled(parsed.excludeIrrelevantTopics);
    }
  });
  transaction();
  return getSettingsSnapshot();
}

export function getSettingsSnapshot(): SettingsSnapshot {
  const db = getRawDb();
  const entities = db.prepare(`
    SELECT id, name, type, acn, incorporation_date, asic_review_date, gst_registered, active, bas_cycle
    FROM entities
    ORDER BY sort_order, id
  `).all() as Array<{
    id: string;
    name: string;
    type: string;
    acn: string | null;
    incorporation_date: DateOnly | null;
    asic_review_date: DateOnly | null;
    gst_registered: number;
    active: number;
    bas_cycle: string;
  }>;
  const licence = db.prepare(`
    SELECT id, holder, type, licence_number, anniversary_date, regulator, portal_url, lodgement_window_weeks
    FROM licences
    ORDER BY id
    LIMIT 1
  `).get() as {
    id: number;
    holder: string;
    type: string;
    licence_number: string | null;
    anniversary_date: DateOnly | null;
    regulator: string;
    portal_url: string;
    lodgement_window_weeks: number;
  } | undefined;
  const settingsRows = db.prepare("SELECT key, value FROM settings ORDER BY key").all() as Array<{ key: string; value: string }>;

  return {
    entities: entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      acn: entity.acn,
      incorporationDate: entity.incorporation_date,
      asicReviewDate: entity.asic_review_date,
      gstRegistered: Boolean(entity.gst_registered),
      active: Boolean(entity.active),
      basCycle: entity.bas_cycle,
    })),
    licence: licence ? {
      id: licence.id,
      holder: licence.holder,
      type: licence.type,
      licenceNumber: licence.licence_number,
      anniversaryDate: licence.anniversary_date,
      regulator: licence.regulator,
      portalUrl: licence.portal_url,
      lodgementWindowWeeks: licence.lodgement_window_weeks,
    } : null,
    settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])),
  };
}
