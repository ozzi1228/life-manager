CREATE TABLE "calendars" (
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
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_exceptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"event_id" uuid NOT NULL,
	"original_date" date NOT NULL,
	"kind" text NOT NULL,
	"override" jsonb
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"calendar_id" uuid NOT NULL,
	"title" text NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"start_date" date NOT NULL,
	"start_time" text,
	"end_date" date NOT NULL,
	"end_time" text,
	"tz" text DEFAULT 'Asia/Seoul' NOT NULL,
	"rrule" text,
	"location" text,
	"memo" text,
	CONSTRAINT "events_dates" CHECK ("events"."start_date" <= "events"."end_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "event_exceptions_occurrence" ON "event_exceptions" USING btree ("event_id","original_date") WHERE "event_exceptions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "events_user_start" ON "events" USING btree ("user_id","start_date") WHERE "events"."deleted_at" is null;