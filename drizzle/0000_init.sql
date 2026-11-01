-- ai_connection은 Drizzle 도입 전(scripts/migrate.mts의 SQL)에 이미 만들어진 DB가 있어 IF NOT EXISTS
CREATE TABLE IF NOT EXISTS "ai_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"priority" integer NOT NULL,
	"secret" text,
	"secret_last4" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_connection_user_id_kind_key" UNIQUE("user_id","kind"),
	CONSTRAINT "ai_connection_kind_check" CHECK ("ai_connection"."kind" in ('claude_plan', 'chatgpt_plan', 'anthropic_key', 'openai_key', 'gemini_key'))
);
--> statement-breakpoint
CREATE TABLE "api_logs" (
	"request_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"status" integer NOT NULL,
	"ms" integer NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"event" text NOT NULL,
	"detail" jsonb,
	"ip_hash" text,
	"user_agent_summary" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_key" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_fields" text[] NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"actor" text NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"week_start" integer DEFAULT 0 NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"seen_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_logs_created_idx" ON "api_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "revisions_entity_idx" ON "revisions" USING btree ("user_id","entity_type","entity_id","created_at" DESC NULLS LAST);