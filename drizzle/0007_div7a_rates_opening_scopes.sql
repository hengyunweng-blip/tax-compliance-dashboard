ALTER TABLE `obligations` ADD COLUMN `scope_key` text NOT NULL DEFAULT 'entity';
--> statement-breakpoint
DROP INDEX `obligations_rule_entity_period_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `obligations_rule_entity_period_unique` ON `obligations` (`rule_id`,`entity_id`,`period_label`,`scope_key`);
--> statement-breakpoint
ALTER TABLE `div7a_loans` ADD COLUMN `original_income_year` text;
--> statement-breakpoint
ALTER TABLE `div7a_loans` ADD COLUMN `security_type` text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `div7a_loans` ADD COLUMN `agreement_signed_at` text;
--> statement-breakpoint
ALTER TABLE `div7a_loans` ADD COLUMN `agreement_document_id` integer REFERENCES `documents`(`id`);
--> statement-breakpoint
ALTER TABLE `div7a_loans` ADD COLUMN `agreement_rate_text` text;
--> statement-breakpoint
ALTER TABLE `div7a_loans` ADD COLUMN `agreement_terms_status` text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
CREATE TABLE `div7a_benchmark_rates` (
	`income_year` text PRIMARY KEY NOT NULL,
	`rate_text` text NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`entry_method` text DEFAULT 'manual' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opening_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`category` text NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` text,
	`as_of_date` text NOT NULL,
	`amount_cents` integer,
	`value_text` text,
	`source_description` text NOT NULL,
	`entered_by` text NOT NULL,
	`entered_at` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opening_balances_reference_unique` ON `opening_balances` (`category`,`reference_id`,`as_of_date`);
--> statement-breakpoint
CREATE INDEX `opening_balances_entity_idx` ON `opening_balances` (`entity_id`,`category`);
