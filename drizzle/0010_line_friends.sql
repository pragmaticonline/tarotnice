CREATE TABLE `line_friends` (
	`line_user_id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`added_at` integer NOT NULL,
	`welcome_code` text,
	`unfollowed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_friends_welcome_code_unique` ON `line_friends` (`welcome_code`);