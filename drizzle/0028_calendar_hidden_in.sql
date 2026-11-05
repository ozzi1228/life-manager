ALTER TABLE "calendars" ADD COLUMN "hidden_in" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- 끈 캘린더는 모든 보기에서 숨김으로 옮김
UPDATE "calendars" SET "hidden_in" = '{year,month,week,day}' WHERE "is_visible" = false;
