// 앱 테이블 (Better Auth 테이블 "user"·"account"·"session"·"verification"은 Better Auth가 관리)
// 바꾼 뒤: npx drizzle-kit generate → scripts/migrate.mts가 적용(업데이트 스크립트가 운영 DB에도)
import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { at, userData } from "./columns.ts";
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

// ── 돈 (06 §3, 14 §4.4) ──
// 분류: 지출·수입. 기본 분류는 처음 쓸 때 만들어짐(src/server/finance.ts). 사치만 참은 소비에 포함(20 §3)
export const finCategories = pgTable(
  "fin_categories",
  {
    ...userData(),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    name: text("name").notNull(),
    colorHex: text("color_hex"),
    sort: integer("sort").notNull().default(0),
    isHidden: boolean("is_hidden").notNull().default(false),
    countsTowardRestraint: boolean("counts_toward_restraint").notNull().default(false),
  },
  (t) => [uniqueIndex("fin_categories_name").on(t.userId, t.kind, t.name).where(sql`${t.deletedAt} is null`)],
);

// 결제수단: 카드·계좌·현금·간편결제
export const paymentMethods = pgTable(
  "payment_methods",
  {
    ...userData(),
    kind: text("kind", { enum: ["card", "account", "cash", "pay"] }).notNull(),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    isHidden: boolean("is_hidden").notNull().default(false),
  },
  (t) => [uniqueIndex("payment_methods_name").on(t.userId, t.name).where(sql`${t.deletedAt} is null`)],
);

// 지출·수입. 금액은 원 단위 양의 정수, 환불은 is_refund=true로 차감(06 §3.2)
export const transactions = pgTable(
  "transactions",
  {
    ...userData(),
    type: text("type", { enum: ["expense", "income"] }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    isRefund: boolean("is_refund").notNull().default(false),
    date: date("date").notNull(),
    categoryId: uuid("category_id").notNull(),
    paymentMethodId: uuid("payment_method_id"),
    title: text("title"),
    memo: text("memo"),
    installmentMonths: integer("installment_months").notNull().default(1),
  },
  (t) => [
    index("transactions_user_date").on(t.userId, t.date.desc()).where(sql`${t.deletedAt} is null`),
    index("transactions_user_category").on(t.userId, t.categoryId, t.date),
    check("transactions_amount_positive", sql`${t.amount} > 0 and ${t.amount} <= 10000000000`),
  ],
);

// ── 목표·월간 트래커 (05, 14 §4.3) ──
export const goalCategories = pgTable(
  "goal_categories",
  { ...userData(), name: text("name").notNull(), sort: integer("sort").notNull().default(0) },
  (t) => [uniqueIndex("goal_categories_name").on(t.userId, t.name).where(sql`${t.deletedAt} is null`)],
);

// 결과 목표. 기간은 연도만(한 해·여러 해·정하지 않음, 05 §3.1). 연도별(새해) 목표는 기간에 그 해가 든 목표를 모아 봄
export const goals = pgTable(
  "goals",
  {
    ...userData(),
    title: text("title").notNull(),
    horizon: text("horizon", { enum: ["short", "mid", "long"] }).notNull().default("short"),
    startYear: integer("start_year"),
    endYear: integer("end_year"),
    categoryId: uuid("category_id"),
    status: text("status", { enum: ["active", "done", "paused", "dropped"] }).notNull().default("active"),
    achievedAt: date("achieved_at"),
    memo: text("memo"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    index("goals_user").on(t.userId).where(sql`${t.deletedAt} is null`),
    check("goals_period", sql`(${t.startYear} is null and ${t.endYear} is null) or (${t.startYear} is not null and ${t.endYear} is not null and ${t.startYear} <= ${t.endYear})`),
  ],
);

// 트래커 항목(행): 여러 달에 걸쳐 같은 항목을 씀. 색·이름은 모든 달에 반영(05 §4.1)
export const trackerItems = pgTable("tracker_items", {
  ...userData(),
  name: text("name").notNull(),
  colorHex: text("color_hex").notNull(),
  goalId: uuid("goal_id"),
  sort: integer("sort").notNull().default(0),
});

// 그 달에 보이는 항목. 한 달에서 빼도 칸 기록은 그대로(05 §4.6)
export const trackerMonthItems = pgTable(
  "tracker_month_items",
  {
    userId: text("user_id").notNull(),
    itemId: uuid("item_id").notNull(),
    month: text("month").notNull(), // YYYY-MM
    sort: integer("sort").notNull().default(0),
  },
  (t) => [unique("tracker_month_items_item_month").on(t.itemId, t.month), index("tracker_month_items_user_month").on(t.userId, t.month)],
);

// 칸: 완료 여부와 메모(40자). 빈 칸(미완료·메모 없음)은 행을 지움. 마지막 저장이 이김(15 §2.5)
// ponytail: 칸은 수가 많고 작아 변경 이력(revisions)을 남기지 않음. 필요해지면 칸 단위 이력 추가
export const trackerCells = pgTable(
  "tracker_cells",
  {
    userId: text("user_id").notNull(),
    itemId: uuid("item_id").notNull(),
    date: date("date").notNull(),
    done: boolean("done").notNull().default(false),
    memo: text("memo"),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("tracker_cells_item_date").on(t.itemId, t.date), index("tracker_cells_user_date").on(t.userId, t.date)],
);

// ── 첨부 파일 (14 §3, 15 §2.9) ──
// 파일은 이 PC 데이터 폴더(.env OONA_FILES_DIR)에. 여기는 정보만. owner는 연결 전엔 비어 있음
export const attachments = pgTable(
  "attachments",
  {
    ...userData(),
    purpose: text("purpose", { enum: ["journal_photo"] }).notNull(),
    ownerType: text("owner_type"),
    ownerId: uuid("owner_id"),
    storageKey: text("storage_key").notNull(), // <user>/<yyyy>/<id> — 변형은 -thumb.webp, -body.webp
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("attachments_owner").on(t.ownerType, t.ownerId)],
);

// ── 일기 (08 §2) ──
export const journalTopics = pgTable(
  "journal_topics",
  {
    ...userData(),
    name: text("name").notNull(),
    colorHex: text("color_hex").notNull(),
    sort: integer("sort").notNull().default(0),
    isHidden: boolean("is_hidden").notNull().default(false),
  },
  (t) => [uniqueIndex("journal_topics_name").on(t.userId, t.name).where(sql`${t.deletedAt} is null`)],
);

// 글 하나 = 날짜 + 주제 + 제목(선택) + 본문(마크다운 텍스트, 5만 자) + 사진 0~10장. 같은 날 여러 글 가능
export const journalEntries = pgTable(
  "journal_entries",
  {
    ...userData(),
    date: date("date").notNull(),
    topicId: uuid("topic_id"),
    title: text("title"),
    bodyMd: text("body_md").notNull().default(""),
  },
  (t) => [index("journal_entries_user_date").on(t.userId, t.date.desc()).where(sql`${t.deletedAt} is null`)],
);

// 고정 지출 (06 §5, 14 §4.4). 해지해도 지우지 않고 상태로(이용 중 → 해지 예정(마지막 이용일) → 해지됨)
export const recurringPayments = pgTable(
  "recurring_payments",
  {
    ...userData(),
    name: text("name").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    variableAmount: boolean("variable_amount").notNull().default(false),
    cycle: text("cycle", { enum: ["monthly", "yearly", "every_n_months", "weekly"] }).notNull(),
    dayOfMonth: integer("day_of_month"), // 1~31, 0 = 말일
    monthOfYear: integer("month_of_year"),
    intervalMonths: integer("interval_months"),
    anchorMonth: text("anchor_month"), // YYYY-MM
    weekday: integer("weekday"),
    paymentMethodId: uuid("payment_method_id"),
    categoryId: uuid("category_id"),
    memo: text("memo"),
    status: text("status", { enum: ["active", "ending", "ended"] }).notNull().default("active"),
    lastUseDate: date("last_use_date"),
    endedAt: date("ended_at"),
    startedAt: date("started_at").notNull(),
    notify: boolean("notify").notNull().default(true),
    autoRecord: boolean("auto_record").notNull().default(false),
  },
  (t) => [
    index("recurring_payments_user").on(t.userId).where(sql`${t.deletedAt} is null`),
    check("recurring_amount_positive", sql`${t.amount} > 0 and ${t.amount} <= 10000000000`),
    check("recurring_ending_has_date", sql`${t.status} <> 'ending' or ${t.lastUseDate} is not null`),
  ],
);

// 내 펫 (11 §5, 14 §4.9) 1차: 동작별 256px PNG를 데이터 폴더(<OONA_FILES_DIR>/<user>/pets/<id>/<동작>.png)에 두고 본인만 봄
// ponytail: 동작 목록만 배열로. 업로드 화면(C-03)에서 애니메이션·프레임이 생기면 pet_actions·attachments로 나눔
export const pets = pgTable(
  "pets",
  {
    ...userData(),
    name: text("name").notNull(),
    poses: text("poses").array().notNull(), // idle 필수
  },
  (t) => [index("pets_user").on(t.userId).where(sql`${t.deletedAt} is null`)],
);
