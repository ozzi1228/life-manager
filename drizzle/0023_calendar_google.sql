CREATE TABLE "calendar_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"account" text,
	"secret" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_links_user_provider" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "color_hex" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_id" text;