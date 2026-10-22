CREATE TABLE `badge_shares` (
	`share_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`milestone_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
