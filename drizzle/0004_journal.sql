CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"purpose" text NOT NULL,
	"owner_type" text,
	"owner_id" uuid,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"date" date NOT NULL,
	"topic_id" uuid,
	"title" text,
	"body_md" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"name" text NOT NULL,
	"color_hex" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attachments_owner" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "journal_entries_user_date" ON "journal_entries" USING btree ("user_id","date" DESC NULLS LAST) WHERE "journal_entries"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_topics_name" ON "journal_topics" USING btree ("user_id","name") WHERE "journal_topics"."deleted_at" is null;