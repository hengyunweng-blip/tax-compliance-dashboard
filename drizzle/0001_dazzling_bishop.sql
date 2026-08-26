PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_obligations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`period_label` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`income_year` text NOT NULL,
	`deadline_fy` text NOT NULL,
	`statutory_due` text,
	`effective_due` text,
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
INSERT INTO `__new_obligations`("id", "rule_id", "entity_id", "period_label", "period_start", "period_end", "income_year", "deadline_fy", "statutory_due", "effective_due", "status", "amount_cents", "lodged_at", "paid_at", "worksheet_id", "notes", "created_at", "updated_at") SELECT "id", "rule_id", "entity_id", "period_label", "period_start", "period_end", "income_year", "deadline_fy", "statutory_due", "effective_due", "status", "amount_cents", "lodged_at", "paid_at", "worksheet_id", "notes", "created_at", "updated_at" FROM `obligations`;--> statement-breakpoint
DROP TABLE `obligations`;--> statement-breakpoint
ALTER TABLE `__new_obligations` RENAME TO `obligations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `obligations_rule_entity_period_unique` ON `obligations` (`rule_id`,`entity_id`,`period_label`);--> statement-breakpoint
CREATE INDEX `obligations_effective_due_idx` ON `obligations` (`effective_due`,`status`);--> statement-breakpoint
ALTER TABLE `obligation_rules` ADD `adjustment_direction` text DEFAULT 'forward' NOT NULL;
--> statement-breakpoint
UPDATE `obligation_rules`
SET `adjustment_direction` = 'backward'
WHERE `id` IN ('trust_distribution_resolution', 'estate_agent_licence_annual_statement', 'super_contribution');
