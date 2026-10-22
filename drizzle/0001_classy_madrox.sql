CREATE TABLE `rate_days` (
	`ip` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_days_ip_day` ON `rate_days` (`ip`,`day`);