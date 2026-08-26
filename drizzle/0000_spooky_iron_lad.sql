CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`default_gst_code` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_entity_code_unique` ON `accounts` (`entity_id`,`code`);--> statement-breakpoint
CREATE TABLE `ai_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`method` text NOT NULL,
	`input_sha256` text NOT NULL,
	`redacted_input_json` text NOT NULL,
	`output_json` text NOT NULL,
	`model_used` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_cache_method_hash_unique` ON `ai_cache` (`method`,`input_sha256`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`reason` text NOT NULL,
	`metadata_json` text,
	`changed_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bas_worksheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`obligation_id` integer NOT NULL,
	`g1_cents` integer DEFAULT 0 NOT NULL,
	`a1_cents` integer DEFAULT 0 NOT NULL,
	`b1_cents` integer DEFAULT 0 NOT NULL,
	`g10_cents` integer DEFAULT 0 NOT NULL,
	`g11_cents` integer DEFAULT 0 NOT NULL,
	`payg_instalment_cents` integer,
	`net_cents` integer DEFAULT 0 NOT NULL,
	`statement_total_cents` integer,
	`snapshot_json` text NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL,
	`export_path` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`obligation_id`) REFERENCES `obligations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bas_worksheets_obligation_id_unique` ON `bas_worksheets` (`obligation_id`);--> statement-breakpoint
CREATE TABLE `csv_mapping_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bank_id` text NOT NULL,
	`mapping_json` text NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `csv_mapping_templates_bank_unique` ON `csv_mapping_templates` (`bank_id`);--> statement-breakpoint
CREATE TABLE `div7a_loans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lender_entity_id` text NOT NULL,
	`borrower` text NOT NULL,
	`loan_date` text NOT NULL,
	`principal_cents` integer NOT NULL,
	`term_years` integer NOT NULL,
	`benchmark_rate` real NOT NULL,
	`min_repayment_fy_cents` integer DEFAULT 0 NOT NULL,
	`repayments_json` text DEFAULT '[]' NOT NULL,
	`agreement_signed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`lender_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text,
	`file_path` text NOT NULL,
	`mime` text NOT NULL,
	`sha256` text NOT NULL,
	`source` text NOT NULL,
	`ocr_text` text,
	`extraction_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`uploaded_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_sha256_unique` ON `documents` (`sha256`);--> statement-breakpoint
CREATE INDEX `documents_entity_idx` ON `documents` (`entity_id`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`abn` text,
	`acn` text,
	`gst_registered` integer DEFAULT false NOT NULL,
	`incorporation_date` text,
	`asic_review_date` text,
	`bas_cycle` text DEFAULT 'none' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `licences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holder` text NOT NULL,
	`type` text NOT NULL,
	`licence_number` text,
	`anniversary_date` text,
	`regulator` text NOT NULL,
	`portal_url` text NOT NULL,
	`lodgement_window_weeks` integer DEFAULT 6 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`holder`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `licences_holder_idx` ON `licences` (`holder`);--> statement-breakpoint
CREATE TABLE `news_analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`news_item_id` integer NOT NULL,
	`affected_entities` text NOT NULL,
	`impact_level` text NOT NULL,
	`summary_json` text NOT NULL,
	`model_used` text NOT NULL,
	`analysed_at` text DEFAULT (datetime('now')) NOT NULL,
	`dismissed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`news_item_id`) REFERENCES `news_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `news_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`published_at` text,
	`raw_text` text NOT NULL,
	`content_hash` text NOT NULL,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `news_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_items_content_hash_unique` ON `news_items` (`content_hash`);--> statement-breakpoint
CREATE TABLE `news_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`fetch_type` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_fetched_at` text,
	`last_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `obligation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`applies_to` text NOT NULL,
	`frequency` text NOT NULL,
	`due_calc` text NOT NULL,
	`reminder_offsets` text NOT NULL,
	`portal_url` text NOT NULL,
	`checklist` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `obligations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`period_label` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`income_year` text NOT NULL,
	`deadline_fy` text NOT NULL,
	`statutory_due` text NOT NULL,
	`effective_due` text NOT NULL,
	`status` text DEFAULT 'blocked' NOT NULL,
	`amount_cents` integer,
	`lodged_at` text,
	`paid_at` text,
	`worksheet_id` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `obligation_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `obligations_rule_entity_period_unique` ON `obligations` (`rule_id`,`entity_id`,`period_label`);--> statement-breakpoint
CREATE INDEX `obligations_effective_due_idx` ON `obligations` (`effective_due`,`status`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`obligation_id` integer NOT NULL,
	`fire_at` text NOT NULL,
	`level` text NOT NULL,
	`acknowledged_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`obligation_id`) REFERENCES `obligations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reminders_fire_idx` ON `reminders` (`fire_at`,`acknowledged_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `super_contributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person` text NOT NULL,
	`fy` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_at` text,
	`notice_submitted_at` text,
	`cap_cents` integer NOT NULL,
	`carry_forward_note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`counterparty` text,
	`amount_cents` integer NOT NULL,
	`gst_cents` integer DEFAULT 0 NOT NULL,
	`account_id` integer NOT NULL,
	`gst_code` text NOT NULL,
	`source` text NOT NULL,
	`document_id` integer,
	`fy` text NOT NULL,
	`quarter` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`review_flag` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_entity_period_idx` ON `transactions` (`entity_id`,`fy`,`quarter`);--> statement-breakpoint
CREATE INDEX `transactions_review_idx` ON `transactions` (`review_flag`,`locked`);