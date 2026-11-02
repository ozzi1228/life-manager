DROP INDEX "career_experiences_user";--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "categories" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "period" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "note" text;--> statement-breakpoint
CREATE INDEX "career_experiences_user" ON "career_experiences" USING btree ("user_id","period_start") WHERE "career_experiences"."deleted_at" is null;