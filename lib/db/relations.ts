import { relations } from "drizzle-orm";
import {
  accounts,
  assets,
  basWorksheets,
  div7aLoans,
  documents,
  entities,
  newsAnalyses,
  newsItems,
  newsSources,
  obligations,
  obligationRules,
  openingBalances,
  reminders,
  transactions,
} from "@/lib/db/schema";

export const entityRelations = relations(entities, ({ many }) => ({
  accounts: many(accounts),
  documents: many(documents),
  transactions: many(transactions),
  obligations: many(obligations),
  div7aLoans: many(div7aLoans),
  openingBalances: many(openingBalances),
  assets: many(assets),
}));

export const accountRelations = relations(accounts, ({ one, many }) => ({
  entity: one(entities, { fields: [accounts.entityId], references: [entities.id] }),
  transactions: many(transactions),
}));

export const documentRelations = relations(documents, ({ one, many }) => ({
  entity: one(entities, { fields: [documents.entityId], references: [entities.id] }),
  transactions: many(transactions),
}));

export const transactionRelations = relations(transactions, ({ one }) => ({
  entity: one(entities, { fields: [transactions.entityId], references: [entities.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  document: one(documents, { fields: [transactions.documentId], references: [documents.id] }),
}));

export const obligationRuleRelations = relations(obligationRules, ({ many }) => ({
  obligations: many(obligations),
}));

export const obligationRelations = relations(obligations, ({ one, many }) => ({
  rule: one(obligationRules, { fields: [obligations.ruleId], references: [obligationRules.id] }),
  entity: one(entities, { fields: [obligations.entityId], references: [entities.id] }),
  reminders: many(reminders),
  worksheet: one(basWorksheets, { fields: [obligations.worksheetId], references: [basWorksheets.id] }),
}));

export const reminderRelations = relations(reminders, ({ one }) => ({
  obligation: one(obligations, { fields: [reminders.obligationId], references: [obligations.id] }),
}));

export const basWorksheetRelations = relations(basWorksheets, ({ one }) => ({
  obligation: one(obligations, { fields: [basWorksheets.obligationId], references: [obligations.id] }),
}));

export const div7aLoanRelations = relations(div7aLoans, ({ one }) => ({
  lender: one(entities, { fields: [div7aLoans.lenderEntityId], references: [entities.id] }),
  agreementDocument: one(documents, { fields: [div7aLoans.agreementDocumentId], references: [documents.id] }),
}));

export const openingBalanceRelations = relations(openingBalances, ({ one }) => ({
  entity: one(entities, { fields: [openingBalances.entityId], references: [entities.id] }),
}));

export const assetRelations = relations(assets, ({ one }) => ({
  entity: one(entities, { fields: [assets.entityId], references: [entities.id] }),
}));

export const newsSourceRelations = relations(newsSources, ({ many }) => ({
  items: many(newsItems),
}));

export const newsItemRelations = relations(newsItems, ({ one, many }) => ({
  source: one(newsSources, { fields: [newsItems.sourceId], references: [newsSources.id] }),
  analyses: many(newsAnalyses),
}));

export const newsAnalysisRelations = relations(newsAnalyses, ({ one }) => ({
  item: one(newsItems, { fields: [newsAnalyses.newsItemId], references: [newsItems.id] }),
}));
