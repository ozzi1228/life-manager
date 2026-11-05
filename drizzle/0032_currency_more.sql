ALTER TABLE "budgets" ADD COLUMN "foreign_lines" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "currency" text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "last4" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "secret" text;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD COLUMN "currency" text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD COLUMN "foreign_amount" bigint;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD COLUMN "currency" text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD COLUMN "foreign_amount" bigint;--> statement-breakpoint
ALTER TABLE "wish_items" ADD COLUMN "currency" text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE "wish_items" ADD COLUMN "foreign_amount" bigint;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_foreign" CHECK (("planned_expenses"."currency" = 'KRW') = ("planned_expenses"."foreign_amount" is null) and coalesce("planned_expenses"."foreign_amount", 1) > 0);--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_foreign" CHECK (("recurring_payments"."currency" = 'KRW') = ("recurring_payments"."foreign_amount" is null) and coalesce("recurring_payments"."foreign_amount", 1) > 0);--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_foreign" CHECK (("wish_items"."currency" = 'KRW') = ("wish_items"."foreign_amount" is null) and coalesce("wish_items"."foreign_amount", 1) > 0);