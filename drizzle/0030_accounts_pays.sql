CREATE TABLE "accounts" (
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
	"category" text DEFAULT 'checking' NOT NULL,
	"bank" text,
	"number" text,
	"balance" bigint,
	"principal" bigint,
	"rate" double precision,
	"tax" text,
	"start_date" date,
	"maturity_date" date,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "pays" (
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
	"source_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"memo" text
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "linked_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "pay_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_payment_method" ON "accounts" USING btree ("user_id","payment_method_id") WHERE "accounts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "pays_payment_method" ON "pays" USING btree ("user_id","payment_method_id") WHERE "pays"."deleted_at" is null;