CREATE TABLE "career_doc_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"doc_id" uuid NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_docs" (
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
	"title" text NOT NULL,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "career_experiences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'project' NOT NULL,
	"organization" text,
	"role" text,
	"start_month" text,
	"end_month" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"links" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"scope" text NOT NULL,
	"period_key" text NOT NULL,
	"body" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "mime" text;--> statement-breakpoint
CREATE INDEX "career_doc_versions_doc" ON "career_doc_versions" USING btree ("doc_id") WHERE "career_doc_versions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "career_docs_user" ON "career_docs" USING btree ("user_id","kind") WHERE "career_docs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "career_experiences_user" ON "career_experiences" USING btree ("user_id","start_month") WHERE "career_experiences"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "period_notes_key" ON "period_notes" USING btree ("user_id","scope","period_key") WHERE "period_notes"."deleted_at" is null;