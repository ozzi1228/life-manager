-- 주는 월요일 시작(전엔 일요일). 주 key를 그 주 일요일 → 다음 날 월요일로(그 일~토 주의 6일이 든 월~일 주)
-- 일요일인 key만 바꿈(두 번 돌아도 안전)
UPDATE "goals" SET "period_key" = to_char("period_key"::date + 1, 'YYYY-MM-DD'), "updated_at" = now()
WHERE "period_scope" = 'week' AND extract(dow FROM "period_key"::date) = 0;
--> statement-breakpoint
UPDATE "period_notes" SET "period_key" = to_char("period_key"::date + 1, 'YYYY-MM-DD'), "updated_at" = now()
WHERE "scope" = 'week' AND extract(dow FROM "period_key"::date) = 0;
