CREATE TABLE `news_todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`news_analysis_id` integer NOT NULL,
	`title` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`confirmed_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`news_analysis_id`) REFERENCES `news_analyses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_todos_news_analysis_id_unique` ON `news_todos` (`news_analysis_id`);
