CREATE TABLE "restraint_entries" (
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
	"date" date NOT NULL,
	"origin" text NOT NULL,
	"wish_item_id" uuid,
	"name" text NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text,
	"status" text DEFAULT 'counted' NOT NULL,
	"bought_month" text,
	CONSTRAINT "restraint_entries_amount_positive" CHECK ("restraint_entries"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "restraint_months" (
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
	"target" bigint NOT NULL,
	"filled" bigint NOT NULL,
	"carried_in" bigint NOT NULL,
	"carry_out" bigint NOT NULL,
	"detail" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "restraint_entries_user_month" ON "restraint_entries" USING btree ("user_id","month") WHERE "restraint_entries"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "restraint_entries_wish" ON "restraint_entries" USING btree ("user_id","wish_item_id") WHERE "restraint_entries"."wish_item_id" is not null and "restraint_entries"."status" <> 'excluded' and "restraint_entries"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "restraint_months_month" ON "restraint_months" USING btree ("user_id","month") WHERE "restraint_months"."deleted_at" is null;