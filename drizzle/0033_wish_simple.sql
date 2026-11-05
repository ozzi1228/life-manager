-- 위시를 한 목록으로: 물건 위시·작품 위시를 합치고, 분류는 이름만(기록 방식 type은 쓰지 않음)
-- 1) 작품 위시 → 일반 위시. 시작함·다 봄 → 했어요(bought)
UPDATE "wish_items" SET "status" = 'bought', "updated_at" = now() WHERE "status" IN ('started', 'finished');--> statement-breakpoint
UPDATE "wish_items" SET "kind" = 'shopping', "updated_at" = now() WHERE "kind" = 'media';--> statement-breakpoint
-- 2) 작품 분류(책·영화·드라마 등) → 위시 분류. 같은 이름이 이미 있으면 옮기지 않고 지움
UPDATE "item_categories" m SET "scope" = 'wish', "sort" = m."sort" + 10, "updated_at" = now()
WHERE m."scope" = 'media' AND m."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "item_categories" w WHERE w."user_id" = m."user_id" AND w."scope" = 'wish' AND w."name" = m."name" AND w."deleted_at" IS NULL);--> statement-breakpoint
UPDATE "item_categories" SET "deleted_at" = now(), "updated_at" = now() WHERE "scope" = 'media' AND "deleted_at" IS NULL;--> statement-breakpoint
-- 3) 분류 없던 작품 위시는 종류 이름(책·영화·드라마) 분류로
UPDATE "wish_items" i SET "category_id" = c."id"
FROM "item_categories" c
WHERE i."category_id" IS NULL AND i."media_kind" IS NOT NULL AND c."user_id" = i."user_id" AND c."scope" = 'wish' AND c."deleted_at" IS NULL
  AND c."name" = CASE i."media_kind" WHEN 'book' THEN '책' WHEN 'movie' THEN '영화' ELSE '드라마' END;--> statement-breakpoint
-- 4) 기본 구분 분류(필요·갖고 싶음·관심)는 '물건' 하나로: 관심 → 물건, 필요·갖고 싶음에 담긴 것은 물건으로 옮기고 지움(직접 만든 분류는 그대로)
UPDATE "item_categories" c SET "name" = '물건', "sort" = 0, "updated_at" = now()
WHERE c."scope" = 'wish' AND c."source" = 'default' AND c."name" = '관심' AND c."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "item_categories" w WHERE w."user_id" = c."user_id" AND w."scope" = 'wish' AND w."name" = '물건' AND w."deleted_at" IS NULL);--> statement-breakpoint
UPDATE "wish_items" i SET "category_id" = t."id"
FROM "item_categories" d, "item_categories" t
WHERE i."category_id" = d."id" AND d."scope" = 'wish' AND d."source" = 'default' AND d."name" IN ('필요', '갖고 싶음') AND d."deleted_at" IS NULL
  AND t."user_id" = d."user_id" AND t."scope" = 'wish' AND t."name" = '물건' AND t."deleted_at" IS NULL;--> statement-breakpoint
UPDATE "item_categories" d SET "deleted_at" = now(), "updated_at" = now()
WHERE d."scope" = 'wish' AND d."source" = 'default' AND d."name" IN ('필요', '갖고 싶음') AND d."deleted_at" IS NULL
  AND EXISTS (SELECT 1 FROM "item_categories" t WHERE t."user_id" = d."user_id" AND t."scope" = 'wish' AND t."name" = '물건' AND t."deleted_at" IS NULL);
