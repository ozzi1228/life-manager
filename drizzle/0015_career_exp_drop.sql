DROP INDEX "career_experiences_user";--> statement-breakpoint
CREATE INDEX "career_experiences_user" ON "career_experiences" USING btree ("user_id") WHERE "career_experiences"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "career_experiences" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "career_experiences" DROP COLUMN "organization";--> statement-breakpoint
ALTER TABLE "career_experiences" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "career_experiences" DROP COLUMN "start_month";--> statement-breakpoint
ALTER TABLE "career_experiences" DROP COLUMN "end_month";--> statement-breakpoint
ALTER TABLE "career_experiences" DROP COLUMN "tags";--> statement-breakpoint
ALTER TABLE "career_experiences" DROP COLUMN "summary";