ALTER TABLE "career_experiences" ADD COLUMN "organization" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "start_text" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "end_text" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "ongoing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "achievement" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "learned" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "star" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "score" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "issuer" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "cert_no" text;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD COLUMN "valid_until" text;