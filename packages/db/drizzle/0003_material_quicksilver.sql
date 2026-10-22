CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `predictions` ADD `model_id` text DEFAULT 'heuristic-v0' NOT NULL;--> statement-breakpoint
ALTER TABLE `predictions` ADD `context` text;--> statement-breakpoint
ALTER TABLE `predictions` ADD `factors` text;--> statement-breakpoint
ALTER TABLE `predictions` ADD `source_event_id` text;--> statement-breakpoint
CREATE INDEX `predictions_model_created_idx` ON `predictions` (`model_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `predictions_model_type_status_idx` ON `predictions` (`model_id`,`event_type`,`status`);