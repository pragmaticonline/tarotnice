CREATE TABLE `affiliate_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tokens` integer NOT NULL,
	`granted_tokens` integer,
	`status` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_affiliate_claims_status` ON `affiliate_claims` (`status`,`created_at` DESC);
