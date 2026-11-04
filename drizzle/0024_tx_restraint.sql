ALTER TABLE "transactions" ADD COLUMN "restraint" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 예전 "사치"처럼 참은 소비에 포함하던 분류의 지출은 지출마다 체크로 옮김(분류 자체는 일반 분류로 남김)
UPDATE "transactions" SET "restraint" = true WHERE "type" = 'expense' AND "category_id" IN (SELECT "id" FROM "fin_categories" WHERE "counts_toward_restraint");--> statement-breakpoint
ALTER TABLE "fin_categories" DROP COLUMN "counts_toward_restraint";
