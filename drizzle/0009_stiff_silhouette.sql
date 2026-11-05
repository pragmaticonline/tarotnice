PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`lang` text DEFAULT 'th' NOT NULL,
	`theme` text,
	`nickname` text,
	`notify_daily` integer DEFAULT 1 NOT NULL,
	`notify_promo` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_prefs`("user_id", "lang", "theme", "nickname", "notify_daily", "notify_promo", "updated_at") SELECT "user_id", "lang", "theme", "nickname", "notify_daily", "notify_promo", "updated_at" FROM `user_prefs`;--> statement-breakpoint
DROP TABLE `user_prefs`;--> statement-breakpoint
ALTER TABLE `__new_user_prefs` RENAME TO `user_prefs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;