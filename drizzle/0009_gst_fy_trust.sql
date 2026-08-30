CREATE TABLE `public_holiday_years` (
	`year` integer PRIMARY KEY NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `victorian_public_holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`holiday_date` text NOT NULL,
	`name` text NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `victorian_public_holidays_year_date_unique` ON `victorian_public_holidays` (`year`,`holiday_date`);
--> statement-breakpoint
CREATE INDEX `victorian_public_holidays_year_idx` ON `victorian_public_holidays` (`year`,`confirmed`);
--> statement-breakpoint
CREATE TABLE `trust_distributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trust_entity_id` text NOT NULL,
	`income_year` text NOT NULL,
	`beneficiary_entity_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`resolution_date` text NOT NULL,
	`status` text NOT NULL,
	`source_description` text NOT NULL,
	`entered_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`trust_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`beneficiary_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trust_distributions_unique` ON `trust_distributions` (`trust_entity_id`,`income_year`,`beneficiary_entity_id`);
--> statement-breakpoint
CREATE INDEX `trust_distributions_trust_year_idx` ON `trust_distributions` (`trust_entity_id`,`income_year`);
--> statement-breakpoint
CREATE INDEX `trust_distributions_beneficiary_year_idx` ON `trust_distributions` (`beneficiary_entity_id`,`income_year`);
--> statement-breakpoint
INSERT OR IGNORE INTO `public_holiday_years` (`year`, `confirmed`, `source_url`, `retrieved_at`) VALUES
	(2026, 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2027, 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30');
--> statement-breakpoint
INSERT OR IGNORE INTO `victorian_public_holidays` (`year`, `holiday_date`, `name`, `confirmed`, `source_url`, `retrieved_at`) VALUES
	(2026, '2026-01-01', 'New Year''s Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-01-26', 'Australia Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-03-09', 'Labour Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-04-03', 'Good Friday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-04-04', 'Saturday before Easter Sunday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-04-05', 'Easter Sunday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-04-06', 'Easter Monday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-04-25', 'ANZAC Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-06-08', 'King''s Birthday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-09-25', 'Friday before the AFL Grand Final', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-11-03', 'Melbourne Cup Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-12-25', 'Christmas Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-12-26', 'Boxing Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2026, '2026-12-28', 'Additional public holiday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026', '2026-08-30'),
	(2027, '2027-01-01', 'New Year''s Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-01-26', 'Australia Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-03-08', 'Labour Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-03-26', 'Good Friday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-03-27', 'Saturday before Easter Sunday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-03-28', 'Easter Sunday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-03-29', 'Easter Monday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-04-25', 'ANZAC Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-06-14', 'King''s Birthday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-11-02', 'Melbourne Cup Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-12-25', 'Christmas Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-12-26', 'Boxing Day', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-12-27', 'Additional public holiday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30'),
	(2027, '2027-12-28', 'Additional public holiday', 1, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027', '2026-08-30');
--> statement-breakpoint
UPDATE `transactions`
SET `review_flag` = 1
WHERE `gst_code` = 'NO_GST'
  AND `account_id` IN (SELECT `id` FROM `accounts` WHERE `type` = 'income');
