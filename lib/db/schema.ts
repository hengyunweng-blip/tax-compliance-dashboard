import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = (name = "created_at") =>
  text(name).notNull().default(sql`(datetime('now'))`);

const updatedAt = (name = "updated_at") =>
  text(name).notNull().default(sql`(datetime('now'))`);

export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  abn: text("abn"),
  acn: text("acn"),
  gstRegistered: integer("gst_registered", { mode: "boolean" }).notNull().default(false),
  incorporationDate: text("incorporation_date"),
  asicReviewDate: text("asic_review_date"),
  basCycle: text("bas_cycle").notNull().default("none"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const licences = sqliteTable("licences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holder: text("holder").notNull().references(() => entities.id),
  type: text("type").notNull(),
  licenceNumber: text("licence_number"),
  anniversaryDate: text("anniversary_date"),
  regulator: text("regulator").notNull(),
  portalUrl: text("portal_url").notNull(),
  lodgementWindowWeeks: integer("lodgement_window_weeks").notNull().default(6),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  holderIndex: index("licences_holder_idx").on(table.holder),
}));

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: text("entity_id").notNull().references(() => entities.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  defaultGstCode: text("default_gst_code").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  entityCodeUnique: uniqueIndex("accounts_entity_code_unique").on(table.entityId, table.code),
}));

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: text("entity_id").references(() => entities.id),
  filePath: text("file_path").notNull(),
  mime: text("mime").notNull(),
  sha256: text("sha256").notNull().unique(),
  source: text("source").notNull(),
  ocrText: text("ocr_text"),
  extractionJson: text("extraction_json"),
  status: text("status").notNull().default("pending"),
  uploadedAt: text("uploaded_at").notNull().default(sql`(datetime('now'))`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  entityIndex: index("documents_entity_idx").on(table.entityId),
}));

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: text("entity_id").notNull().references(() => entities.id),
  date: text("date").notNull(),
  description: text("description").notNull(),
  counterparty: text("counterparty"),
  amountCents: integer("amount_cents").notNull(),
  gstCents: integer("gst_cents").notNull().default(0),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  gstCode: text("gst_code").notNull(),
  source: text("source").notNull(),
  documentId: integer("document_id").references(() => documents.id),
  fy: text("fy").notNull(),
  quarter: text("quarter").notNull(),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  reviewFlag: integer("review_flag", { mode: "boolean" }).notNull().default(false),
  belongsToClosedPeriod: integer("belongs_to_closed_period", { mode: "boolean" }).notNull().default(false),
  closedPeriodWorksheetId: integer("closed_period_worksheet_id"),
  closedPeriodResolution: text("closed_period_resolution"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  periodIndex: index("transactions_entity_period_idx").on(table.entityId, table.fy, table.quarter),
  reviewIndex: index("transactions_review_idx").on(table.reviewFlag, table.locked),
  closedPeriodIndex: index("transactions_closed_period_idx").on(table.belongsToClosedPeriod, table.closedPeriodResolution, table.locked),
}));

export const obligationRules = sqliteTable("obligation_rules", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  appliesTo: text("applies_to").notNull(),
  frequency: text("frequency").notNull(),
  dueCalc: text("due_calc").notNull(),
  adjustmentDirection: text("adjustment_direction").notNull().default("forward"),
  requiredFields: text("required_fields").notNull().default("[]"),
  reminderOffsets: text("reminder_offsets").notNull(),
  portalUrl: text("portal_url").notNull(),
  checklist: text("checklist").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const obligations = sqliteTable("obligations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: text("rule_id").notNull().references(() => obligationRules.id),
  entityId: text("entity_id").notNull().references(() => entities.id),
  periodLabel: text("period_label").notNull(),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  incomeYear: text("income_year").notNull(),
  deadlineFy: text("deadline_fy").notNull(),
  statutoryDue: text("statutory_due"),
  effectiveDue: text("effective_due"),
  status: text("status").notNull().default("blocked"),
  amountCents: integer("amount_cents"),
  lodgedAt: text("lodged_at"),
  paidAt: text("paid_at"),
  worksheetId: integer("worksheet_id"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  ruleEntityPeriodUnique: uniqueIndex("obligations_rule_entity_period_unique").on(
    table.ruleId,
    table.entityId,
    table.periodLabel,
  ),
  dueIndex: index("obligations_effective_due_idx").on(table.effectiveDue, table.status),
}));

export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  obligationId: integer("obligation_id").notNull().references(() => obligations.id),
  fireAt: text("fire_at").notNull(),
  level: text("level").notNull(),
  acknowledgedAt: text("acknowledged_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  fireIndex: index("reminders_fire_idx").on(table.fireAt, table.acknowledgedAt),
}));

export const basWorksheets = sqliteTable("bas_worksheets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  obligationId: integer("obligation_id").notNull().unique().references(() => obligations.id),
  g1Cents: integer("g1_cents").notNull().default(0),
  a1Cents: integer("a1_cents").notNull().default(0),
  b1Cents: integer("b1_cents").notNull().default(0),
  g10Cents: integer("g10_cents").notNull().default(0),
  g11Cents: integer("g11_cents").notNull().default(0),
  payg5aCents: integer("payg_5a_cents"),
  payg5bCents: integer("payg_5b_cents"),
  paygInstalmentCents: integer("payg_instalment_cents"),
  netCents: integer("net_cents").notNull().default(0),
  statementTotalCents: integer("statement_total_cents"),
  snapshotJson: text("snapshot_json").notNull(),
  generatedAt: text("generated_at").notNull().default(sql`(datetime('now'))`),
  exportPath: text("export_path"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const div7aLoans = sqliteTable("div7a_loans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lenderEntityId: text("lender_entity_id").notNull().references(() => entities.id),
  borrower: text("borrower").notNull(),
  loanDate: text("loan_date").notNull(),
  principalCents: integer("principal_cents").notNull(),
  termYears: integer("term_years").notNull(),
  benchmarkRate: real("benchmark_rate").notNull(),
  minRepaymentFyCents: integer("min_repayment_fy_cents").notNull().default(0),
  repaymentsJson: text("repayments_json").notNull().default("[]"),
  agreementSigned: integer("agreement_signed", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const superContributions = sqliteTable("super_contributions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  person: text("person").notNull(),
  fy: text("fy").notNull(),
  amountCents: integer("amount_cents").notNull(),
  paidAt: text("paid_at"),
  noticeSubmittedAt: text("notice_submitted_at"),
  capCents: integer("cap_cents").notNull(),
  carryForwardNote: text("carry_forward_note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const newsSources = sqliteTable("news_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  fetchType: text("fetch_type").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastFetchedAt: text("last_fetched_at"),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const newsItems = sqliteTable("news_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceId: integer("source_id").notNull().references(() => newsSources.id),
  title: text("title").notNull(),
  url: text("url").notNull(),
  publishedAt: text("published_at"),
  rawText: text("raw_text").notNull(),
  contentHash: text("content_hash").notNull().unique(),
  fetchedAt: text("fetched_at").notNull().default(sql`(datetime('now'))`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const newsAnalyses = sqliteTable("news_analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  newsItemId: integer("news_item_id").notNull().references(() => newsItems.id),
  affectedEntities: text("affected_entities").notNull(),
  impactLevel: text("impact_level").notNull(),
  summaryJson: text("summary_json").notNull(),
  modelUsed: text("model_used").notNull(),
  analysedAt: text("analysed_at").notNull().default(sql`(datetime('now'))`),
  dismissedAt: text("dismissed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const newsTodos = sqliteTable("news_todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  newsAnalysisId: integer("news_analysis_id").notNull().unique().references(() => newsAnalyses.id),
  title: text("title").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull().default("todo"),
  confirmedAt: text("confirmed_at").notNull().default(sql`(datetime('now'))`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  reason: text("reason").notNull(),
  metadataJson: text("metadata_json"),
  changedAt: text("changed_at").notNull().default(sql`(datetime('now'))`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const aiCache = sqliteTable("ai_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  method: text("method").notNull(),
  inputSha256: text("input_sha256").notNull(),
  redactedInputJson: text("redacted_input_json").notNull(),
  outputJson: text("output_json").notNull(),
  modelUsed: text("model_used").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  methodHashUnique: uniqueIndex("ai_cache_method_hash_unique").on(table.method, table.inputSha256),
}));

export const csvMappingTemplates = sqliteTable("csv_mapping_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bankId: text("bank_id").notNull(),
  mappingJson: text("mapping_json").notNull(),
  lastUsedAt: text("last_used_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  bankUnique: uniqueIndex("csv_mapping_templates_bank_unique").on(table.bankId),
}));

export const schema = {
  entities,
  licences,
  accounts,
  documents,
  transactions,
  obligationRules,
  obligations,
  reminders,
  basWorksheets,
  div7aLoans,
  superContributions,
  newsSources,
  newsItems,
  newsAnalyses,
  newsTodos,
  settings,
  auditLog,
  aiCache,
  csvMappingTemplates,
};

export const tableNames = [
  "entities",
  "licences",
  "accounts",
  "documents",
  "transactions",
  "obligation_rules",
  "obligations",
  "reminders",
  "bas_worksheets",
  "div7a_loans",
  "super_contributions",
  "news_sources",
  "news_items",
  "news_analyses",
  "news_todos",
  "settings",
  "audit_log",
  "ai_cache",
  "csv_mapping_templates",
];

export const amountColumns = [
  "transactions.amount_cents",
  "transactions.gst_cents",
  "obligations.amount_cents",
  "bas_worksheets.g1_cents",
  "bas_worksheets.a1_cents",
  "bas_worksheets.b1_cents",
  "bas_worksheets.g10_cents",
  "bas_worksheets.g11_cents",
  "bas_worksheets.payg_5a_cents",
  "bas_worksheets.payg_5b_cents",
  "bas_worksheets.payg_instalment_cents",
  "bas_worksheets.net_cents",
  "bas_worksheets.statement_total_cents",
  "div7a_loans.principal_cents",
  "div7a_loans.min_repayment_fy_cents",
  "super_contributions.amount_cents",
  "super_contributions.cap_cents",
].map((name) => ({ name, dataType: "number" as const, columnType: "INTEGER" as const }));

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type Obligation = typeof obligations.$inferSelect;
export type NewObligation = typeof obligations.$inferInsert;
export type BasWorksheet = typeof basWorksheets.$inferSelect;
