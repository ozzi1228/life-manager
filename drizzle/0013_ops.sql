CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"job" text NOT NULL,
	"status" text NOT NULL,
	"detail" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"device" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_key" ON "job_runs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "job_runs_job_started" ON "job_runs" USING btree ("job","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user" ON "push_subscriptions" USING btree ("user_id");