CREATE TABLE "health_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"time" text NOT NULL,
	"context" text,
	"value_enc" text NOT NULL,
	"memo_enc" text
);
--> statement-breakpoint
CREATE INDEX "health_records_user_kind_date" ON "health_records" USING btree ("user_id","kind","date") WHERE "health_records"."deleted_at" is null;