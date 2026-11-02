ALTER TABLE "goals" ADD COLUMN "period_scope" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "period_key" text;--> statement-breakpoint
CREATE INDEX "goals_period_key" ON "goals" USING btree ("user_id","period_scope","period_key") WHERE "goals"."deleted_at" is null;