CREATE TABLE `redeem_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`bonus_tokens` integer NOT NULL,
	`expires_at` integer,
	`max_uses` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `redeem_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `redeem_codes`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redeem_redemptions_code_user` ON `redeem_redemptions` (`code`,`user_id`);--> statement-breakpoint
ALTER TABLE `token_ledger` ADD `amount` integer;--> statement-breakpoint
ALTER TABLE `token_ledger` ADD `currency` text;--> statement-breakpoint
ALTER TABLE `token_ledger` ADD `receipt_url` text;--> statement-breakpoint
ALTER TABLE `token_ledger` ADD `payment_method` text;--> statement-breakpoint
ALTER TABLE `user_prefs` ADD `notify_daily` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_prefs` ADD `notify_promo` integer DEFAULT 0 NOT NULL;