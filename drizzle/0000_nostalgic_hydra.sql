CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `card_meanings` (
	`card_id` integer NOT NULL,
	`lang` text NOT NULL,
	`name` text NOT NULL,
	`keywords_upright` text NOT NULL,
	`keywords_reversed` text NOT NULL,
	`upright` text NOT NULL,
	`reversed` text NOT NULL,
	`love` text,
	`career` text,
	`money` text,
	`health` text,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_meanings_card_lang` ON `card_meanings` (`card_id`,`lang`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`arcana` text NOT NULL,
	`suit` text,
	`rank` integer,
	`image_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_slug_unique` ON `cards` (`slug`);--> statement-breakpoint
CREATE TABLE `daily_draws` (
	`user_id` text NOT NULL,
	`bangkok_day` text NOT NULL,
	`card_id` integer NOT NULL,
	`reversed` integer NOT NULL,
	`message` text NOT NULL,
	`lang` text NOT NULL,
	`share_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_draws_share_id_unique` ON `daily_draws` (`share_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_draws_user_day` ON `daily_draws` (`user_id`,`bangkok_day`);--> statement-breakpoint
CREATE TABLE `daily_message_cache` (
	`bangkok_day` text NOT NULL,
	`card_id` integer NOT NULL,
	`reversed` integer NOT NULL,
	`lang` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_message_cache_key` ON `daily_message_cache` (`bangkok_day`,`card_id`,`reversed`,`lang`);--> statement-breakpoint
CREATE TABLE `readings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bangkok_day` text NOT NULL,
	`topic` text NOT NULL,
	`question` text NOT NULL,
	`lang` text NOT NULL,
	`cards` text NOT NULL,
	`ai_text` text,
	`ai_summary` text,
	`model` text,
	`status` text NOT NULL,
	`journal` text,
	`share_id` text,
	`share_question` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readings_share_id_unique` ON `readings` (`share_id`);--> statement-breakpoint
CREATE INDEX `readings_user_day` ON `readings` (`user_id`,`bangkok_day`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`visitor_user_id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`referrer_user_id` text NOT NULL,
	`first_reading_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`user_id` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`is_anonymous` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`lang` text DEFAULT 'th' NOT NULL,
	`theme` text,
	`nickname` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
