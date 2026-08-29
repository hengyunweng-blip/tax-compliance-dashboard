CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`asset_type` text,
	`purchase_date` text NOT NULL,
	`available_for_use_date` text,
	`cost_ex_gst_cents` integer NOT NULL,
	`useful_life_years` integer,
	`method` text,
	`private_use_percent` integer,
	`opening_accumulated_depreciation_cents` integer,
	`opening_book_value_cents` integer,
	`disposal_date` text,
	`disposal_amount_cents` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_entity_purchase_date_idx` ON `assets` (`entity_id`,`purchase_date`);
