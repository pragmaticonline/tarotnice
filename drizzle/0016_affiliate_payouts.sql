CREATE TABLE `affiliate_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'THB' NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`paid_at` integer,
	`paid_by` text,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_affiliate_payouts_status` ON `affiliate_payouts` (`status`,`requested_at`);
--> statement-breakpoint
DROP TABLE `affiliate_claims`;
