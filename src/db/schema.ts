// 앱 테이블 (Better Auth 테이블 "user"·"account"·"session"·"verification"은 Better Auth가 관리)
// 바꾼 뒤: npx drizzle-kit generate → scripts/migrate.mts가 적용(업데이트 스크립트가 운영 DB에도)
import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, doublePrecision, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  // 알림 끄기(04 §8.4): false인 종류만 저장. 없으면 켜짐 — payment(결제 하루 전)·budget(예산 80%·초과)·restraint(월 정산 결과)
  // 메뉴·탭 순서(끌어 바꾼 것만): "main" = 사이드바·하단 탭, 그 밖은 탭 묶음의 첫 주소(예: "/money") → 주소 순서
  // 경험 분류 목록(분류 편집에서 고친 것: 순서·이름·색·보일 칸). null이면 기본 목록(src/lib/career.ts DEFAULT_CATEGORIES). 예전 모양(이름만)도 읽음
  expCategories: jsonb("exp_categories").$type<(string | { name: string; color?: string | null; sections?: ("content" | "star" | "cert")[] })[]>(),
  navOrder: jsonb("nav_order").$type<Record<string, string[]>>().notNull().default({}),
  notify: jsonb("notify").$type<Partial<Record<"payment" | "budget" | "restraint", boolean>>>().notNull().default({}),
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
// 분류: 지출·수입. 기본 분류는 처음 쓸 때 만들어짐(src/server/finance.ts). 참은 소비 대상은 분류가 아니라 지출마다 체크(transactions.restraint)
export const finCategories = pgTable(
  "fin_categories",
  {
    ...userData(),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    name: text("name").notNull(),
    colorHex: text("color_hex"),
    sort: integer("sort").notNull().default(0),
    isHidden: boolean("is_hidden").notNull().default(false),
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

// 지출·수입. 금액은 원 단위 양의 정수(외화는 원화 환산액 + 원래 금액), 환불은 is_refund=true로 차감(06 §3.2)
export const transactions = pgTable(
  "transactions",
  {
    ...userData(),
    type: text("type", { enum: ["expense", "income"] }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(), // 언제나 원(합계·예산·통계는 이것만 셈)
    currency: text("currency").notNull().default("KRW"), // 다른 통화로 쓴 돈이면 그 통화(src/lib/format.ts CURRENCIES)
    foreignAmount: bigint("foreign_amount", { mode: "number" }), // 그 통화의 가장 작은 단위 금액(센트 등). 원이면 null — amount는 그때 원화로 얼마였는지
    isRefund: boolean("is_refund").notNull().default(false),
    restraint: boolean("restraint").notNull().default(false), // "참아서 갚기": 이 지출만큼 참은 소비를 채워야 함(20 §3)
    date: date("date").notNull(),
    categoryId: uuid("category_id").notNull(),
    paymentMethodId: uuid("payment_method_id"),
    title: text("title"),
    memo: text("memo"),
    installmentMonths: integer("installment_months").notNull().default(1),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`), // 개인 태그(분류와 별개, 여러 개). 정리 규칙은 finance.ts cleanTags
    plannedExpenseId: uuid("planned_expense_id"), // 큰 지출에 연결되면 분류별 예산 사용에서 빠짐(06 §4.1)
    payId: uuid("pay_id"), // 거친 페이(결제수단 kind=pay). payment_method_id는 언제나 돈이 실제로 나간 곳(연결 카드·계좌·페이 머니) — 카드별 합계가 두 번 잡히지 않게(06 §6.7)
  },
  (t) => [
    index("transactions_user_date").on(t.userId, t.date.desc()).where(sql`${t.deletedAt} is null`),
    index("transactions_user_category").on(t.userId, t.categoryId, t.date),
    check("transactions_amount_positive", sql`${t.amount} > 0 and ${t.amount} <= 10000000000`),
    check("transactions_foreign", sql`(${t.currency} = 'KRW') = (${t.foreignAmount} is null) and coalesce(${t.foreignAmount}, 1) > 0`),
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
    // 월·주·일 목표(D-072): 일정 기간 메모와 같은 key(월 "2026-11" · 주는 그 주 일요일 · 일). 이때 연도는 비움
    periodScope: text("period_scope", { enum: ["month", "week", "day"] }),
    periodKey: text("period_key"),
  },
  (t) => [
    index("goals_user").on(t.userId).where(sql`${t.deletedAt} is null`),
    index("goals_period_key").on(t.userId, t.periodScope, t.periodKey).where(sql`${t.deletedAt} is null`),
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
    purpose: text("purpose", { enum: ["journal_photo", "media_cover", "wish_image", "career_file"] }).notNull(),
    ownerType: text("owner_type"),
    ownerId: uuid("owner_id"),
    storageKey: text("storage_key").notNull(), // <user>/<yyyy>/<id> — 변형은 -thumb.webp, -body.webp
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    sort: integer("sort").notNull().default(0),
    // 사진이 아닌 파일(커리어 문서: PDF·Word·PPT·한글): 원래 이름과 형식. 사진은 비어 있음
    fileName: text("file_name"),
    mime: text("mime"),
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
    amount: bigint("amount", { mode: "number" }).notNull(), // 언제나 원
    currency: text("currency").notNull().default("KRW"), // 다른 통화면 그 통화(src/lib/format.ts CURRENCIES)
    foreignAmount: bigint("foreign_amount", { mode: "number" }), // 그 통화의 가장 작은 단위 금액. 원이면 null — amount는 원화 환산액
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
    check("recurring_foreign", sql`(${t.currency} = 'KRW') = (${t.foreignAmount} is null) and coalesce(${t.foreignAmount}, 1) > 0`),
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

// 월별 예산 (06 §4, 14 §4.4). 분류별 예산은 한 행의 jsonb({분류 id: 금액})로 — 예산 저장이 한 번에 되고 버전 충돌도 한 곳에서
// ponytail: 14의 budget_lines 테이블 대신 jsonb. 분류별 예산을 따로 묻는 쿼리가 필요해지면 나눔
export const budgets = pgTable(
  "budgets",
  {
    ...userData(),
    month: text("month").notNull(), // YYYY-MM
    lines: jsonb("lines").$type<Record<string, number>>().notNull().default({}), // 언제나 원
    foreignLines: jsonb("foreign_lines").$type<Record<string, { currency: string; amount: number }>>().notNull().default({}), // 다른 통화로 정한 분류 예산: 원래 통화·금액(lines는 원화 환산액)
    copyNext: boolean("copy_next").notNull().default(true), // 다음 달 첫 진입 때 분류별 예산 복사(큰 지출은 복사 안 함)
  },
  (t) => [uniqueIndex("budgets_month").on(t.userId, t.month).where(sql`${t.deletedAt} is null`)],
);

// 큰 지출: 그 달에만 크게 나가는 돈의 계획(여행, 경조사). 지출을 연결하면 사용 금액이 잡힘
export const plannedExpenses = pgTable(
  "planned_expenses",
  {
    ...userData(),
    month: text("month").notNull(),
    name: text("name").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(), // 언제나 원
    currency: text("currency").notNull().default("KRW"), // 다른 통화면 그 통화(src/lib/format.ts CURRENCIES)
    foreignAmount: bigint("foreign_amount", { mode: "number" }), // 그 통화의 가장 작은 단위 금액. 원이면 null — amount는 원화 환산액
    manuallyDone: boolean("manually_done").notNull().default(false),
  },
  (t) => [
    index("planned_expenses_month").on(t.userId, t.month).where(sql`${t.deletedAt} is null`),
    check("planned_amount_positive", sql`${t.amount} > 0 and ${t.amount} <= 10000000000`),
    check("planned_foreign", sql`(${t.currency} = 'KRW') = (${t.foreignAmount} is null) and coalesce(${t.foreignAmount}, 1) > 0`),
  ],
);

// 카드 (06 §6.2, 14 §4.4, D-071: 혜택·실적 계산 없이 메모로). 결제수단(kind=card)과 1:1 — 지출 입력에서 만든 카드도 그대로 카드 목록에 나옴. 설정은 처음 고칠 때 생김
export const cards = pgTable(
  "cards",
  {
    ...userData(),
    paymentMethodId: uuid("payment_method_id").notNull(),
    issuer: text("issuer"),
    cardType: text("card_type", { enum: ["credit", "check"] }),
    billingDay: integer("billing_day"),
    annualFee: bigint("annual_fee", { mode: "number" }), // currency의 가장 작은 단위
    currency: text("currency").notNull().default("KRW"), // 연회비 통화
    last4: text("last4"), // 카드번호 뒤 4자리(목록에 •••• 1234)
    secret: text("secret"), // 카드번호·CVC·유효기간 JSON을 암호화(src/lib/ai/secret.ts seal). 볼 때만 풀어서 보냄
    memo: text("memo"),
    linkedAccountId: uuid("linked_account_id"), // 결제 계좌(결제수단 kind=account의 id). 계좌 화면의 연결 카드·카드 대금
  },
  (t) => [uniqueIndex("cards_payment_method").on(t.userId, t.paymentMethodId).where(sql`${t.deletedAt} is null`)],
);

// 페이 (06 §6.7). 결제수단(kind=pay)과 1:1. 페이에 연결한 카드·계좌(결제수단 id) — 지출 입력에서 "어디서 나갔나요?" 선택지
export const pays = pgTable(
  "pays",
  {
    ...userData(),
    paymentMethodId: uuid("payment_method_id").notNull(),
    sourceIds: uuid("source_ids").array().notNull().default(sql`'{}'::uuid[]`),
    memo: text("memo"),
  },
  (t) => [uniqueIndex("pays_payment_method").on(t.userId, t.paymentMethodId).where(sql`${t.deletedAt} is null`)],
);

// 계좌 (06 §7). 결제수단(kind=account)과 1:1. 종류마다 쓰는 칸이 다름: 예금·적금은 시작·만기·이율·과세, 주식은 원금·평가 금액
// ponytail: 잔액은 현재 값 하나. 추이 그래프가 필요해지면 스냅샷 테이블로
export const accounts = pgTable(
  "accounts",
  {
    ...userData(),
    paymentMethodId: uuid("payment_method_id").notNull(),
    category: text("category", { enum: ["checking", "deposit", "savings", "stock"] }).notNull().default("checking"),
    currency: text("currency").notNull().default("KRW"), // 잔액·원금의 통화. 금액은 그 통화의 가장 작은 단위
    bank: text("bank"),
    number: text("number"),
    balance: bigint("balance", { mode: "number" }), // 입출금 잔액 / 주식 평가 금액
    principal: bigint("principal", { mode: "number" }), // 예금 예치 금액 / 적금 월 납입액 / 주식 투자 원금
    rate: doublePrecision("rate"), // 연 이율(%)
    tax: text("tax", { enum: ["normal", "preferential", "free"] }),
    startDate: date("start_date"),
    maturityDate: date("maturity_date"),
    memo: text("memo"),
  },
  (t) => [uniqueIndex("accounts_payment_method").on(t.userId, t.paymentMethodId).where(sql`${t.deletedAt} is null`)],
);

// ── 작품 기록 (08 §3, 14 §4.6) ──
// 작품 정보 1개 + 감상 기록 n개(다시 읽기·보기). 표지는 올린 사진(attachments) — 검색(C-09)이 붙으면 외부 주소·저자 jsonb 추가
export const mediaWorks = pgTable("media_works", {
  ...userData(),
  kind: text("kind", { enum: ["book", "movie", "drama"] }).notNull(),
  title: text("title").notNull(),
  creator: text("creator"), // 저자 / 감독·출연
  coverAttachmentId: uuid("cover_attachment_id"),
  categoryId: uuid("category_id"), // item_categories(scope media). kind는 그 분류의 type
});

// 상태는 종류와 상관없이 3가지(화면 이름은 종류별: 읽는 중·보는 중 / 완독·봤어요·다 봄 / 중도 포기). 영화는 done만
// ponytail: 14의 watched_dates 배열 대신 영화는 기록 하나 = 본 날 하나(end_date). 다시 보면 기록을 하나 더
export const mediaLogs = pgTable(
  "media_logs",
  {
    ...userData(),
    workId: uuid("work_id").notNull(),
    status: text("status", { enum: ["ongoing", "done", "dropped"] }).notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    rating: doublePrecision("rating"), // 0.5~5, 0.5 단위
    oneLiner: text("one_liner"),
    review: text("review"),
    whereText: text("where_text"),
    fromWishId: uuid("from_wish_id"),
  },
  (t) => [
    index("media_logs_user_end").on(t.userId, t.endDate).where(sql`${t.deletedAt} is null`),
    index("media_logs_work").on(t.workId),
    check("media_logs_rating", sql`${t.rating} is null or (${t.rating} >= 0.5 and ${t.rating} <= 5)`),
    check("media_logs_dates", sql`${t.startDate} is null or ${t.endDate} is null or ${t.startDate} <= ${t.endDate}`),
  ],
);

// ── 위시 (09, 14 §4.7) ──
// 이미지는 attachments(owner_type=wish_item). 쇼핑은 가격 필수(09 §4)
// ponytail: 14의 wish_links 테이블 대신 링크는 배열 — 링크 미리보기(P1)가 붙으면 링크별 제목·이미지를 위해 나눔
export const wishItems = pgTable(
  "wish_items",
  {
    ...userData(),
    kind: text("kind", { enum: ["shopping", "media"] }).notNull(),
    mediaKind: text("media_kind", { enum: ["book", "movie", "drama"] }),
    name: text("name").notNull(),
    level: text("level", { enum: ["need", "want", "like"] }),
    price: bigint("price", { mode: "number" }), // 언제나 원
    currency: text("currency").notNull().default("KRW"), // 다른 통화면 그 통화(src/lib/format.ts CURRENCIES)
    foreignAmount: bigint("foreign_amount", { mode: "number" }), // 그 통화의 가장 작은 단위 금액. 원이면 null — price는 원화 환산액
    seenWhere: text("seen_where"), // 쇼핑: 어디서 봤는지 / 작품: 메모(누가 추천했는지 등)
    links: text("links").array().notNull().default(sql`'{}'::text[]`),
    status: text("status", { enum: ["saved", "bought", "dropped", "started", "finished"] }).notNull().default("saved"),
    doneAt: date("done_at"), // 구매한 날·그만둔 날·작품 기록으로 옮긴 날
    droppedReason: text("dropped_reason"),
    transactionId: uuid("transaction_id"),
    mediaLogId: uuid("media_log_id"),
    categoryId: uuid("category_id"), // 쇼핑: item_categories(scope wish). level은 그 분류의 type
  },
  (t) => [
    index("wish_items_user_kind").on(t.userId, t.kind, t.status).where(sql`${t.deletedAt} is null`),
    check("wish_items_shopping_price", sql`${t.kind} <> 'shopping' or ${t.price} > 0`),
    check("wish_items_foreign", sql`(${t.currency} = 'KRW') = (${t.foreignAmount} is null) and coalesce(${t.foreignAmount}, 1) > 0`),
  ],
);

// 위시(쇼핑)·작품 분류: 사용자가 추가·이름·순서·지우기. type = 기록 방식
// wish: need|want|like(참은 소비 후보 규칙이 씀) · media: book|movie|drama(입력 칸·상태 이름이 씀)
export const itemCategories = pgTable(
  "item_categories",
  {
    ...userData(),
    scope: text("scope", { enum: ["wish", "media"] }).notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("item_categories_name").on(t.userId, t.scope, t.name).where(sql`${t.deletedAt} is null`)],
);

// ── 참은 소비 (20, 14 §4.4) ──
// 기록 하나 = 참은 물건 하나. 이름·금액은 기록 시점 복사본(위시가 바뀌거나 지워져도 그대로)
// 한 위시는 한 번만 센다(D-039): 빼기(excluded)한 것만 다시 대상
// ponytail: 이미지·링크 칸은 아직 없음 — 위시에서 고르면 위시 쪽에 남아 있음
export const restraintEntries = pgTable(
  "restraint_entries",
  {
    ...userData(),
    month: text("month").notNull(), // YYYY-MM, 이 달의 참은 금액에 더해짐
    date: date("date").notNull(),
    origin: text("origin", { enum: ["manual", "wish_auto", "wish_dropped", "wish_picked"] }).notNull(),
    wishItemId: uuid("wish_item_id"),
    name: text("name").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    reason: text("reason"),
    status: text("status", { enum: ["counted", "excluded", "later_bought"] }).notNull().default("counted"),
    boughtMonth: text("bought_month"), // 나중에 산 달 — 그 달 참아야 할 금액에 더해짐(D-041)
  },
  (t) => [
    index("restraint_entries_user_month").on(t.userId, t.month).where(sql`${t.deletedAt} is null`),
    uniqueIndex("restraint_entries_wish").on(t.userId, t.wishItemId).where(sql`${t.wishItemId} is not null and ${t.status} <> 'excluded' and ${t.deletedAt} is null`),
    check("restraint_entries_amount_positive", sql`${t.amount} > 0`),
  ],
);

// 월 정산 결과(20 §6). 지난 달은 정산 때 고정, 부족분은 다음 달로 넘김(D-040)
// ponytail: 부족분 넘기기 설정(끄기)은 아직 — 늘 넘김
export const restraintMonths = pgTable(
  "restraint_months",
  {
    ...userData(),
    month: text("month").notNull(),
    target: bigint("target", { mode: "number" }).notNull(),
    filled: bigint("filled", { mode: "number" }).notNull(),
    carriedIn: bigint("carried_in", { mode: "number" }).notNull(),
    carryOut: bigint("carry_out", { mode: "number" }).notNull(),
    detail: jsonb("detail").$type<{ luxury: number; overage: { categoryId: string; over: number }[]; laterBought: number }>().notNull(),
  },
  (t) => [uniqueIndex("restraint_months_month").on(t.userId, t.month).where(sql`${t.deletedAt} is null`)],
);

// ── 일정 (07, 14 §4.5) ──
// 내 캘린더 여러 개(이름·색·보이기). source "google"이면 구글에서 가져온 읽기 전용 사본(external_id = 구글 캘린더 id)
export const calendars = pgTable("calendars", {
  ...userData(),
  name: text("name").notNull(),
  colorHex: text("color_hex").notNull(),
  hiddenIn: text("hidden_in").array().notNull().default(sql`'{}'::text[]`), // 숨긴 보기(year·month·week·day) — 보기마다 다른 캘린더
  sort: integer("sort").notNull().default(0),
  externalId: text("external_id"),
});

// 구글 캘린더 연결(07 §4 G1 가져오기): 사용자당 하나. secret = 봉인한 refresh token(src/lib/ai/secret.ts), 없으면 앱 키만 넣고 아직 연결 전
// client_id·client_secret(봉인) = 사용자가 화면에서 넣은 구글 앱 키. 없으면 .env의 GOOGLE_CLIENT_ID·SECRET
export const calendarLinks = pgTable(
  "calendar_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    provider: text("provider").notNull(),
    account: text("account"),
    secret: text("secret"),
    clientId: text("client_id"),
    clientSecret: text("client_secret"),
    status: text("status").notNull().default("ok"), // ok | broken(구글에서 권한 해제 등 → 다시 연결)
    syncedAt: at("synced_at"),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("calendar_links_user_provider").on(t.userId, t.provider)],
);

// 일정: 날짜 + (종일이 아니면) 시각. 반복은 RRULE 문자열(src/lib/calendar.ts)
// ponytail: 시각은 사용자 시간대 벽시계 값(tz 열에 시간대). 알림(P1)·구글 연동(C-08)이 붙으면 UTC 시각 열 추가
export const events = pgTable(
  "events",
  {
    ...userData(),
    calendarId: uuid("calendar_id").notNull(),
    title: text("title").notNull(),
    allDay: boolean("all_day").notNull().default(false),
    startDate: date("start_date").notNull(),
    startTime: text("start_time"), // HH:MM
    endDate: date("end_date").notNull(),
    endTime: text("end_time"),
    tz: text("tz").notNull().default("Asia/Seoul"),
    rrule: text("rrule"),
    location: text("location"),
    memo: text("memo"),
    colorHex: text("color_hex"), // 일정만의 배경색(없으면 캘린더 색)
    externalId: text("external_id"), // 구글 일정 id(가져온 사본)
  },
  (t) => [index("events_user_start").on(t.userId, t.startDate).where(sql`${t.deletedAt} is null`), check("events_dates", sql`${t.startDate} <= ${t.endDate}`)],
);

// 반복 회차 예외: 이 회차만 고침(modified, 바뀐 값) / 이 회차만 지움(cancelled)
export const eventExceptions = pgTable(
  "event_exceptions",
  {
    ...userData(),
    eventId: uuid("event_id").notNull(),
    originalDate: date("original_date").notNull(),
    kind: text("kind", { enum: ["modified", "cancelled"] }).notNull(),
    override: jsonb("override").$type<Record<string, unknown>>(),
  },
  (t) => [uniqueIndex("event_exceptions_occurrence").on(t.eventId, t.originalDate).where(sql`${t.deletedAt} is null`)],
);

// ── 건강 (10, 14 §4.8): 체중·혈당. 생리 주기는 만들지 않음(D-063) ──
// 값·메모는 암호화해 저장(Q-041 추천안, src/lib/ai/secret.ts). 추세는 서버에서 풀어 계산
// ponytail: 14의 health_metrics(지표 정의) 대신 종류 열 하나 — 직접 만든 지표(P2)가 생기면 나눔
export const healthRecords = pgTable(
  "health_records",
  {
    ...userData(),
    kind: text("kind", { enum: ["weight", "glucose", "injection"] }).notNull(), // injection: 값 칸에 {약 이름, 용량, 부위}를 암호화한 JSON
    date: date("date").notNull(),
    time: text("time").notNull(), // HH:MM, 사용자 시간대
    context: text("context", { enum: ["fasting", "before_meal", "after_1h", "after_2h", "bedtime", "other"] }), // 혈당 측정 시점
    valueEnc: text("value_enc").notNull(),
    memoEnc: text("memo_enc"),
  },
  (t) => [index("health_records_user_kind_date").on(t.userId, t.kind, t.date).where(sql`${t.deletedAt} is null`)],
);

// ── 운영 (16 §5.5·§6·§12) ──
// 예약 작업 실행 기록 = 중복 방지 장부. key는 "작업:대상:날짜"처럼 한 번만 해야 하는 단위(같은 key는 다시 안 함)
// 알림도 여기로 한 번만 보냄(예: notify:payment:<user>:<고정 지출>:<결제일>). 90일 지나면 정리
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    key: text("key").notNull(),
    job: text("job").notNull(),
    status: text("status", { enum: ["running", "ok", "failed"] }).notNull(),
    detail: jsonb("detail"),
    error: text("error"),
    startedAt: at("started_at").notNull().defaultNow(),
    finishedAt: at("finished_at"),
  },
  (t) => [uniqueIndex("job_runs_key").on(t.key), index("job_runs_job_started").on(t.job, t.startedAt.desc())],
);

// 웹 푸시 구독(기기마다 하나). 보내다 410/404가 오면 지움
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
    device: text("device"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint").on(t.endpoint), index("push_subscriptions_user").on(t.userId)],
);

// 기간 메모(일정 화면): 연·월·주·일마다 하나. key: 연 "2026" · 월 "2026-11" · 주 그 주 일요일 "2026-11-01" · 일 "2026-11-02"
export const periodNotes = pgTable(
  "period_notes",
  {
    ...userData(),
    scope: text("scope", { enum: ["year", "month", "week", "day"] }).notNull(),
    periodKey: text("period_key").notNull(),
    body: text("body").notNull().default(""),
  },
  (t) => [uniqueIndex("period_notes_key").on(t.userId, t.scope, t.periodKey).where(sql`${t.deletedAt} is null`)],
);

// ── 커리어 ──
// 경험 정리: 취업 준비에서 흔히 쓰는 경험 정리 양식(D-064). 사용자가 Notion에 쓰던 칸(이름·유형·기간·내용·비고)도 모두 담김
// 기본(경험명·분류·기관·역할·기간) · 내용(주요 활동·성과·배운 점·역량 키워드) · STAR · 자격·점수(점수·발급 기관·번호·유효기간) · 비고·링크
// 기간은 "2024.06" 또는 "2024.06.01" 글자 그대로(정밀도 유지), 정렬은 시작일(period_start)로
export const careerExperiences = pgTable(
  "career_experiences",
  {
    ...userData(),
    title: text("title").notNull(),
    categories: text("categories").array().notNull().default(sql`'{}'::text[]`), // 분류(예: 교육·아르바이트·자격증·IT)
    organization: text("organization"), // 기관·소속
    role: text("role"), // 역할·직무
    startText: text("start_text"), // YYYY.MM 또는 YYYY.MM.DD
    endText: text("end_text"),
    ongoing: boolean("ongoing").notNull().default(false),
    periodStart: date("period_start"), // 시작일(정렬용)
    body: text("body").notNull().default(""), // 주요 활동·업무
    achievement: text("achievement"), // 성과·결과
    learned: text("learned"), // 배운 점·느낀 점
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`), // 역량 키워드
    star: jsonb("star").$type<{ situation?: string; task?: string; action?: string; result?: string }>().notNull().default({}),
    score: text("score"), // 점수·등급(자격·어학)
    issuer: text("issuer"), // 발급 기관
    certNo: text("cert_no"), // 자격·수험 번호
    validUntil: text("valid_until"), // 유효기간(까지)
    note: text("note"), // 비고
    links: text("links").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [index("career_experiences_user").on(t.userId, t.periodStart).where(sql`${t.deletedAt} is null`)],
);

// 문서(이력서·자소서·포트폴리오): 문서 1개 → 버전 n개 → 버전마다 형식 여러 개(링크·파일)
export const careerDocs = pgTable(
  "career_docs",
  {
    ...userData(),
    kind: text("kind", { enum: ["resume", "cover_letter", "portfolio", "other"] }).notNull(),
    title: text("title").notNull(),
    memo: text("memo"),
  },
  (t) => [index("career_docs_user").on(t.userId, t.kind).where(sql`${t.deletedAt} is null`)],
);

// 형식(items): 링크(Notion·웹 등) 또는 올린 파일(attachments, owner_type=career_doc_version)
export const careerDocVersions = pgTable(
  "career_doc_versions",
  {
    ...userData(),
    docId: uuid("doc_id").notNull(),
    label: text("label").notNull(), // 예: v3 · 카카오 지원용
    note: text("note"),
    items: jsonb("items").$type<{ id: string; type: "link" | "file"; url: string | null; attachmentId: string | null; name: string | null }[]>().notNull().default([]),
  },
  (t) => [index("career_doc_versions_doc").on(t.docId).where(sql`${t.deletedAt} is null`)],
);
