CREATE TABLE "journal_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"entry_id" uuid NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "journal_comments_entry" ON "journal_comments" USING btree ("user_id","entry_id","created_at") WHERE "journal_comments"."deleted_at" is null;