CREATE TABLE "goal_categories" (
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
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
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
	"horizon" text DEFAULT 'short' NOT NULL,
	"start_year" integer,
	"end_year" integer,
	"category_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"achieved_at" date,
	"memo" text,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "goals_period" CHECK (("goals"."start_year" is null and "goals"."end_year" is null) or ("goals"."start_year" is not null and "goals"."end_year" is not null and "goals"."start_year" <= "goals"."end_year"))
);
--> statement-breakpoint
CREATE TABLE "tracker_cells" (
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"date" date NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"memo" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracker_cells_item_date" UNIQUE("item_id","date")
);
--> statement-breakpoint
CREATE TABLE "tracker_items" (
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
	"goal_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_month_items" (
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"month" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tracker_month_items_item_month" UNIQUE("item_id","month")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "goal_categories_name" ON "goal_categories" USING btree ("user_id","name") WHERE "goal_categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "goals_user" ON "goals" USING btree ("user_id") WHERE "goals"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tracker_cells_user_date" ON "tracker_cells" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "tracker_month_items_user_month" ON "tracker_month_items" USING btree ("user_id","month");