DROP INDEX `token_ledger_reason_ref`;--> statement-breakpoint
CREATE UNIQUE INDEX `token_ledger_user_reason_ref` ON `token_ledger` (`user_id`,`reason`,`ref`);