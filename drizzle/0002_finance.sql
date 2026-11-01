CREATE TABLE "fin_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"color_hex" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"counts_toward_restraint" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"delete_batch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"is_refund" boolean DEFAULT false NOT NULL,
	"date" date NOT NULL,
	"category_id" uuid NOT NULL,
	"payment_method_id" uuid,
	"title" text,
	"memo" text,
	"installment_months" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0 and "transactions"."amount" <= 10000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fin_categories_name" ON "fin_categories" USING btree ("user_id","kind","name") WHERE "fin_categories"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_name" ON "payment_methods" USING btree ("user_id","name") WHERE "payment_methods"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_user_date" ON "transactions" USING btree ("user_id","date" DESC NULLS LAST) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_user_category" ON "transactions" USING btree ("user_id","category_id","date");