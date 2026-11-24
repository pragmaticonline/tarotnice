CREATE TABLE `affiliates` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled_at` integer NOT NULL,
	`enabled_by` text NOT NULL,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
