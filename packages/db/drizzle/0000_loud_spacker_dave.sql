CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`user_id` text,
	`occurred_at` integer NOT NULL,
	`ended_at` integer,
	`amount` real,
	`unit` text,
	`notes` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_type_occurred_idx` ON `events` (`type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `events_occurred_idx` ON `events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`predicted_at` integer NOT NULL,
	`confidence` real NOT NULL,
	`basis` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`actual_event_id` text,
	`notified_at` integer,
	`feedback_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `predictions_created_idx` ON `predictions` (`created_at`);--> statement-breakpoint
CREATE INDEX `predictions_type_status_idx` ON `predictions` (`event_type`,`status`);--> statement-breakpoint
CREATE TABLE `puppy` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`birthdate` integer,
	`notes` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`global_name` text,
	`avatar` text,
	`created_at` integer NOT NULL
);
