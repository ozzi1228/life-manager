CREATE TABLE "item_categories" (
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
	"name" text NOT NULL,
	"type" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_works" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "wish_items" ADD COLUMN "category_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_name" ON "item_categories" USING btree ("user_id","scope","name") WHERE "item_categories"."deleted_at" is null;