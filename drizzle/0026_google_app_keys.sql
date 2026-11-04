ALTER TABLE "calendar_links" ALTER COLUMN "secret" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_links" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "calendar_links" ADD COLUMN "client_secret" text;