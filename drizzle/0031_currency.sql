ALTER TABLE "accounts" ADD COLUMN "currency" text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "currency" text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "foreign_amount" bigint;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_foreign" CHECK (("transactions"."currency" = 'KRW') = ("transactions"."foreign_amount" is null) and coalesce("transactions"."foreign_amount", 1) > 0);