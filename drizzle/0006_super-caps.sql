CREATE TABLE `super_caps` (
	`income_year` text PRIMARY KEY NOT NULL,
	`concessional_cap_cents` integer NOT NULL,
	`non_concessional_cap_cents` integer NOT NULL,
	`concessional_source_url` text NOT NULL,
	`concessional_retrieved_at` text NOT NULL,
	`non_concessional_source_url` text NOT NULL,
	`non_concessional_retrieved_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
