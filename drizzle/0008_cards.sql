CREATE TABLE "card_benefits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"card_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"targets" text[] NOT NULL,
	"benefit_type" text NOT NULL,
	"value_type" text NOT NULL,
	"value" double precision NOT NULL,
	"per_txn_max" bigint,
	"min_amount" bigint,
	"limit_type" text DEFAULT 'none' NOT NULL,
	"monthly_limit" bigint,
	"tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days_of_week" integer[],
	"time_from" text,
	"time_to" text,
	"exclude_installment" boolean DEFAULT false NOT NULL,
	"exclude_online" boolean DEFAULT false NOT NULL,
	"exclude_note" text,
	"memo" text,
	CONSTRAINT "card_benefit_value_positive" CHECK ("card_benefits"."value" > 0)
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"issuer" text,
	"card_type" text,
	"billing_day" integer,
	"perf_excludes" jsonb DEFAULT '{"categoryIds":[],"industries":[]}'::jsonb NOT NULL,
	"annual_fee" bigint,
	"verified_at" date,
	"memo" text
);
--> statement-breakpoint
CREATE INDEX "card_benefits_card" ON "card_benefits" USING btree ("card_id") WHERE "card_benefits"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cards_payment_method" ON "cards" USING btree ("user_id","payment_method_id") WHERE "cards"."deleted_at" is null;