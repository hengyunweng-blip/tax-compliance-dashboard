ALTER TABLE `transactions` ADD `belongs_to_closed_period` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `closed_period_worksheet_id` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `closed_period_resolution` text;--> statement-breakpoint
CREATE INDEX `transactions_closed_period_idx` ON `transactions` (`belongs_to_closed_period`,`closed_period_resolution`,`locked`);
