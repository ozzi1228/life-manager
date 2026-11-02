CREATE TABLE "media_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"work_id" uuid NOT NULL,
	"status" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"rating" double precision,
	"one_liner" text,
	"review" text,
	"where_text" text,
	"from_wish_id" uuid,
	CONSTRAINT "media_logs_rating" CHECK ("media_logs"."rating" is null or ("media_logs"."rating" >= 0.5 and "media_logs"."rating" <= 5)),
	CONSTRAINT "media_logs_dates" CHECK ("media_logs"."start_date" is null or "media_logs"."end_date" is null or "media_logs"."start_date" <= "media_logs"."end_date")
);
--> statement-breakpoint
CREATE TABLE "media_works" (
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
	"creator" text,
	"cover_attachment_id" uuid
);
--> statement-breakpoint
CREATE TABLE "wish_items" (
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
	"media_kind" text,
	"name" text NOT NULL,
	"level" text,
	"price" bigint,
	"seen_where" text,
	"links" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'saved' NOT NULL,
	"done_at" date,
	"dropped_reason" text,
	"transaction_id" uuid,
	"media_log_id" uuid,
	CONSTRAINT "wish_items_shopping_price" CHECK ("wish_items"."kind" <> 'shopping' or "wish_items"."price" > 0)
);
--> statement-breakpoint
CREATE INDEX "media_logs_user_end" ON "media_logs" USING btree ("user_id","end_date") WHERE "media_logs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "media_logs_work" ON "media_logs" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "wish_items_user_kind" ON "wish_items" USING btree ("user_id","kind","status") WHERE "wish_items"."deleted_at" is null;