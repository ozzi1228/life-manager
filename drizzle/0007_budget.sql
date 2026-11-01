CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"month" text NOT NULL,
	"lines" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"copy_next" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"month" text NOT NULL,
	"name" text NOT NULL,
	"amount" bigint NOT NULL,
	"manually_done" boolean DEFAULT false NOT NULL,
	CONSTRAINT "planned_amount_positive" CHECK ("planned_expenses"."amount" > 0 and "planned_expenses"."amount" <= 10000000000)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "planned_expense_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_month" ON "budgets" USING btree ("user_id","month") WHERE "budgets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "planned_expenses_month" ON "planned_expenses" USING btree ("user_id","month") WHERE "planned_expenses"."deleted_at" is null;