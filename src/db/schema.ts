// 앱 테이블 (Better Auth 테이블 "user"·"account"·"session"·"verification"은 Better Auth가 관리)
// 바꾼 뒤: npx drizzle-kit generate → scripts/migrate.mts가 적용(업데이트 스크립트가 운영 DB에도)
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { at } from "./columns.ts";
import { uuidv7 } from "./id.ts";

const userRef = () => text("user_id").notNull();

// 변경 이력 (14 §1.4): 바뀐 필드만 이전·이후 값
export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    userId: userRef(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action", { enum: ["create", "update", "delete", "restore", "revert"] }).notNull(),
    changedFields: text("changed_fields").array().notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    actor: text("actor").notNull(),
    requestId: text("request_id"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [index("revisions_entity_idx").on(t.userId, t.entityType, t.entityId, t.createdAt.desc())],
);

// 감사 로그 (14 §1.5): 사용자 데이터 내용은 넣지 않음
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    userId: text("user_id"),
    event: text("event").notNull(),
    detail: jsonb("detail"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent_summary"),
    requestId: text("request_id"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_user_idx").on(t.userId, t.createdAt.desc())],
);

// 생성 요청 멱등 키 (15 §2.4): 24시간
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    userId: userRef(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: integer("status").notNull(),
    response: jsonb("response").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [unique("idempotency_keys_user_key").on(t.userId, t.key)],
);

// API 로그 (14 §5.1): 본문·쿠키·키는 남기지 않음. ponytail: 파티션·날짜별 파일 이동은 M-21(운영)에서
export const apiLogs = pgTable(
  "api_logs",
  {
    requestId: text("request_id").primaryKey(),
    userId: text("user_id"),
    method: text("method").notNull(),
    route: text("route").notNull(),
    status: integer("status").notNull(),
    ms: integer("ms").notNull(),
    errorCode: text("error_code"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [index("api_logs_created_idx").on(t.createdAt)],
);

// 사용자 설정 (14 §3): 사용자당 1행
export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  timezone: text("timezone").notNull().default("Asia/Seoul"),
  weekStart: integer("week_start").notNull().default(0), // 0=일요일
  theme: text("theme", { enum: ["system", "light", "dark"] }).notNull().default("system"),
  seenHints: jsonb("seen_hints").$type<string[]>().notNull().default([]),
  // 온보딩에서 고른 관리 영역(홈 위젯 켜기, 04 §2.4): goals·money·calendar·records·health
  areas: jsonb("areas").$type<string[]>().notNull().default([]),
  onboardedAt: at("onboarded_at"),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

// AI 연결 (12 §3·§4, D-060)
export const aiConnection = pgTable(
  "ai_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    kind: text("kind").notNull(),
    priority: integer("priority").notNull(),
    secret: text("secret"),
    secretLast4: text("secret_last4"),
    model: text("model"),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("ai_connection_user_id_kind_key").on(t.userId, t.kind),
    check("ai_connection_kind_check", sql`${t.kind} in ('claude_plan', 'chatgpt_plan', 'anthropic_key', 'openai_key', 'gemini_key')`),
  ],
);
