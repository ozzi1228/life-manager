// 돈 서비스 (docs/planning/06 §3, 15 §6). 화면(Server Action)과 이후 /api/v1이 함께 씀
import { and, arrayOverlaps, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, max, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/index.ts";
import { finCategories, paymentMethods, pays, plannedExpenses, transactions } from "../db/schema.ts";
import { CURRENCY_CODES, rateOf, type Currency } from "../lib/format.ts";
import type { TxFilter } from "../lib/tx-search.ts";
import { parse } from "./validate.ts";
import { AppError } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";

export const categoryRepo = defineRepo(finCategories, "fin_category");
export const paymentRepo = defineRepo(paymentMethods, "payment_method");
export const txRepo = defineRepo(transactions, "transaction");
export const plannedRepo = defineRepo(plannedExpenses, "planned_expense");

// 기본 분류(04 §6.13). 참은 소비 대상은 분류가 아니라 지출마다 체크(20 §3)
const DEFAULT_EXPENSE = ["식비", "카페·간식", "교통", "쇼핑", "생활", "문화·여가", "건강·의료", "교육", "경조사·선물", "여행", "구독·고정", "기타"];
const DEFAULT_INCOME = ["급여", "용돈", "부수입", "환급", "기타 수입"];

/** 처음 쓸 때 기본 분류·결제수단(현금)을 만듦. 이미 있으면 아무것도 안 함 */
async function ensureDefaults(ctx: Ctx) {
  const [has] = await db.select({ id: finCategories.id }).from(finCategories).where(eq(finCategories.userId, ctx.userId)).limit(1);
  if (has) return;
  await db.transaction(async (tx) => {
    const rows = [
      ...DEFAULT_EXPENSE.map((name, i) => ({ kind: "expense" as const, name, sort: i })),
      ...DEFAULT_INCOME.map((name, i) => ({ kind: "income" as const, name, sort: i })),
    ];
    for (const r of rows) await categoryRepo.create(ctx, r, { source: "default", tx });
    await paymentRepo.create(ctx, { kind: "cash", name: "현금" }, { source: "default", tx });
  });
}

/** 입력 화면용: 분류(분류 편집에서 정한 순서), 결제수단(최근 쓴 순), 마지막 쓴 결제수단 */
export async function formData(ctx: Ctx) {
  await ensureDefaults(ctx);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const lastUse = (col: typeof transactions.categoryId | typeof transactions.paymentMethodId) =>
    db
      .select({ id: col, last: max(transactions.createdAt) })
      .from(transactions)
      .where(and(eq(transactions.userId, ctx.userId), isNull(transactions.deletedAt), gte(transactions.date, since)))
      .groupBy(col);
  const [cats, pms, pmUse, planned, tags, payRows, paySrc, rateRows] = await Promise.all([
    categoryRepo.list(ctx, { where: eq(finCategories.isHidden, false), orderBy: [asc(finCategories.sort)] }),
    paymentRepo.list(ctx, { where: eq(paymentMethods.isHidden, false), orderBy: [asc(paymentMethods.sort), asc(paymentMethods.createdAt)] }),
    lastUse(transactions.paymentMethodId),
    plannedRepo.list(ctx, { where: gte(plannedExpenses.month, since.slice(0, 7)), orderBy: [asc(plannedExpenses.createdAt)] }),
    tagList(ctx),
    db.select({ pmId: pays.paymentMethodId, sourceIds: pays.sourceIds }).from(pays).where(and(eq(pays.userId, ctx.userId), isNull(pays.deletedAt))),
    // 페이마다 마지막으로 돈이 나간 곳(입력 창 기본값)
    db.execute<{ pay_id: string; payment_method_id: string }>(sql`
      select distinct on (pay_id) pay_id, payment_method_id from ${transactions}
      where user_id = ${ctx.userId} and deleted_at is null and pay_id is not null and payment_method_id is not null
      order by pay_id, created_at desc`),
    db.execute<{ currency: Currency; amount: string; foreign_amount: string }>(sql`
      select distinct on (currency) currency, amount, foreign_amount from ${transactions}
      where user_id = ${ctx.userId} and deleted_at is null and foreign_amount is not null
      order by currency, date desc, created_at desc`),
  ]);
  // 통화마다 마지막으로 쓴 환율(1단위당 원) — 외화 입력 때 원화 금액을 미리 채움
  const rates = Object.fromEntries(rateRows.rows.map((r) => [r.currency, rateOf(Number(r.amount), Number(r.foreign_amount), r.currency)])) as Partial<Record<Currency, number>>;
  const recent = (uses: { id: string | null; last: Date | null }[]) => new Map(uses.map((u) => [u.id, u.last?.getTime() ?? 0]));
  const byRecent = <T extends { id: string; sort: number }>(list: T[], use: Map<string | null, number>) =>
    [...list].sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0) || a.sort - b.sort);
  const pmRecent = recent(pmUse);
  const orderedPm = byRecent(pms, pmRecent);
  const alive = new Set(pms.map((p) => p.id));
  const last = new Map(paySrc.rows.map((r) => [r.pay_id, r.payment_method_id]));
  return {
    categories: cats.map((c) => ({ id: c.id, kind: c.kind, name: c.name })),
    paymentMethods: orderedPm.map((p) => ({ id: p.id, kind: p.kind, name: p.name })),
    /** 페이 id → 연결한 카드·계좌(숨긴 것 빼고)와 마지막으로 고른 곳 */
    pays: Object.fromEntries(payRows.filter((r) => alive.has(r.pmId)).map((r) => [r.pmId, { sourceIds: r.sourceIds.filter((id) => alive.has(id)), last: last.get(r.pmId) ?? null }])),
    lastPaymentMethodId: pmRecent.size ? orderedPm[0]?.id ?? null : null,
    planned: planned.map((p) => ({ id: p.id, month: p.month, name: p.name })),
    tags,
    rates,
  };
}

/** 태그 정리: #·쉼표 빼고 공백은 한 칸, 20자, 같은 건 하나만, 10개까지 */
export const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.replace(/[#,]/g, "").replace(/\s+/g, " ").trim().slice(0, 20)).filter(Boolean))].slice(0, 10);

/** 내가 쓴 태그(많이 쓴 순) — 입력 자동완성·필터용 */
export async function tagList(ctx: Ctx) {
  const r = await db.execute<{ tag: string }>(sql`
    select tag from (select unnest(${transactions.tags}) as tag from ${transactions} where ${transactions.userId} = ${ctx.userId} and ${transactions.deletedAt} is null) t
    group by tag order by count(*) desc, tag limit 100`);
  return r.rows.map((x) => x.tag);
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 선택해 주세요");
export const txInput = z.object({
  type: z.enum(["expense", "income"]),
  amount: z.number({ error: "금액을 입력해 주세요" }).int().min(1, "1원 이상 입력해 주세요").max(10_000_000_000, "100억 원까지 입력할 수 있어요"),
  currency: z.enum(CURRENCY_CODES).default("KRW"),
  foreignAmount: z.number().int().min(1, "금액을 입력해 주세요").max(1_000_000_000_000, "금액을 다시 확인해 주세요").nullable().default(null), // 외화일 때 그 통화 금액(가장 작은 단위). amount는 원화 환산액
  isRefund: z.boolean().default(false),
  restraint: z.boolean().default(false),
  date: ymd,
  categoryId: z.uuid({ error: "분류를 골라 주세요" }),
  paymentMethodId: z.uuid().nullable().default(null),
  title: z.string().trim().max(60, "내용은 60자까지 쓸 수 있어요").nullable().default(null),
  memo: z.string().trim().max(1000).nullable().default(null),
  tags: z.array(z.string().max(100)).max(30).default([]).transform(cleanTags),
  plannedExpenseId: z.uuid().nullable().default(null),
  payId: z.uuid().nullable().default(null),
});
export type TxInput = z.input<typeof txInput>;

/** 분류·결제수단이 내 것이고 종류가 맞는지(교차 사용자 참조 방지, 14 §7) */
async function checkRefs(ctx: Ctx, v: { type: string; categoryId: string; paymentMethodId: string | null; plannedExpenseId: string | null; payId: string | null }) {
  const cat = await categoryRepo.get(ctx, v.categoryId).catch(() => null);
  if (!cat || cat.kind !== v.type) throw new AppError("VALIDATION_FAILED", "분류를 골라 주세요", { fields: [{ path: "categoryId", rule: "exists", message: "분류를 골라 주세요" }] });
  if (v.paymentMethodId && !(await paymentRepo.get(ctx, v.paymentMethodId).catch(() => null)))
    throw new AppError("VALIDATION_FAILED", "결제수단을 다시 골라 주세요", { fields: [{ path: "paymentMethodId", rule: "exists", message: "결제수단을 다시 골라 주세요" }] });
  if (v.plannedExpenseId && !(await plannedRepo.get(ctx, v.plannedExpenseId).catch(() => null))) throw new AppError("VALIDATION_FAILED", "큰 지출을 다시 골라 주세요");
  if (v.payId && (await paymentRepo.get(ctx, v.payId).catch(() => null))?.kind !== "pay") throw new AppError("VALIDATION_FAILED", "페이를 다시 골라 주세요");
  return cat;
}

const clean = (v: z.infer<typeof txInput>) => {
  if (v.currency !== "KRW" && !v.foreignAmount) throw new AppError("VALIDATION_FAILED", "금액을 입력해 주세요", { fields: [{ path: "foreignAmount", rule: "required", message: "금액을 입력해 주세요" }] });
  return { ...v, foreignAmount: v.currency === "KRW" ? null : v.foreignAmount, title: v.title || null, memo: v.memo || null, isRefund: v.type === "expense" && v.isRefund, restraint: v.type === "expense" && v.restraint, plannedExpenseId: v.type === "expense" ? v.plannedExpenseId : null, payId: v.type === "expense" ? v.payId : null };
};

export async function createTransaction(ctx: Ctx, input: unknown, tx?: Tx) {
  const v = clean(parse(txInput, input));
  await checkRefs(ctx, v);
  const row = await txRepo.create(ctx, v, { tx });
  return { row, restraint: v.restraint && !v.isRefund };
}

export async function updateTransaction(ctx: Ctx, id: string, version: number, input: unknown) {
  const v = clean(parse(txInput, input));
  await checkRefs(ctx, v);
  return txRepo.update(ctx, id, version, v);
}

/** 한 달 목록(날짜 최신순, 같은 날은 나중에 쓴 것 먼저) */
export async function monthTransactions(ctx: Ctx, month: string, type?: "expense" | "income") {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
  const [y, m] = month.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  return txRepo.list(ctx, {
    where: and(gte(transactions.date, `${month}-01`), lt(transactions.date, next), type ? eq(transactions.type, type) : undefined),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit: 1000,
  });
}

/** 검색·필터(src/lib/tx-search.ts readFilter). 검색어는 내용·메모·태그·분류 이름·결제수단 이름에서 찾음 */
// ponytail: 5000건까지만 불러와 화면에서 셈. 더 쌓이면 통계를 SQL 집계로
export const SEARCH_LIMIT = 5000;
export async function searchTransactions(ctx: Ctx, f: TxFilter) {
  const t = transactions;
  const w: (SQL | undefined)[] = [f.from ? gte(t.date, f.from) : undefined, f.to ? lte(t.date, f.to) : undefined];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`; // % _ \ 는 글자 그대로
    const [cats, pms] = await Promise.all([
      db.select({ id: finCategories.id }).from(finCategories).where(and(eq(finCategories.userId, ctx.userId), ilike(finCategories.name, like))),
      db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.userId, ctx.userId), ilike(paymentMethods.name, like))),
    ]);
    w.push(
      or(
        ilike(t.title, like),
        ilike(t.memo, like),
        sql`array_to_string(${t.tags}, ' ') ilike ${like}`,
        cats.length ? inArray(t.categoryId, cats.map((c) => c.id)) : undefined,
        pms.length ? inArray(t.paymentMethodId, pms.map((p) => p.id)) : undefined,
        pms.length ? inArray(t.payId, pms.map((p) => p.id)) : undefined,
      ),
    );
  }
  if (f.type === "income") w.push(eq(t.type, "income"));
  if (f.type === "expense") w.push(eq(t.type, "expense"), eq(t.isRefund, false));
  if (f.type === "refund") w.push(eq(t.isRefund, true));
  if (f.cats.length) w.push(inArray(t.categoryId, f.cats));
  if (f.pms.length) w.push(or(inArray(t.paymentMethodId, f.pms), inArray(t.payId, f.pms))); // 페이를 고르면 그 페이로 쓴 것도
  if (f.tags.length) w.push(arrayOverlaps(t.tags, f.tags)); // 고른 태그 중 하나라도
  if (f.min !== undefined) w.push(gte(t.amount, f.min));
  if (f.max !== undefined) w.push(lte(t.amount, f.max));
  if (f.restraint) w.push(eq(t.restraint, true));
  return txRepo.list(ctx, { where: and(...w), orderBy: [desc(t.date), desc(t.createdAt)], limit: SEARCH_LIMIT });
}

/** 지출 합계(환불 차감)와 수입 합계 */
export function totals(rows: { type: string; amount: number; isRefund: boolean }[]) {
  let expense = 0;
  let income = 0;
  for (const r of rows) {
    if (r.type === "income") income += r.amount;
    else expense += r.isRefund ? -r.amount : r.amount;
  }
  return { expense, income };
}

export const categoryInput = z.object({ kind: z.enum(["expense", "income"]), name: z.string().trim().min(1, "이름을 입력해 주세요").max(20, "이름은 20자까지 쓸 수 있어요") });
export const paymentInput = z.object({ kind: z.enum(["card", "account", "cash", "pay"]), name: z.string().trim().min(1, "이름을 입력해 주세요").max(20, "이름은 20자까지 쓸 수 있어요") });

async function nextSort(table: typeof finCategories | typeof paymentMethods, ctx: Ctx) {
  const [r] = await db.select({ s: sql<number>`coalesce(max(${table.sort}), 0) + 1` }).from(table).where(eq(table.userId, ctx.userId));
  return r.s;
}

/** 같은 이름이 있으면 409(DUPLICATE). 지운 이름은 다시 쓸 수 있음(부분 고유 인덱스) */
export const dup = (e: unknown, what: string) => {
  if ((e as { cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string })?.code === "23505")
    throw new AppError("DUPLICATE", `이미 같은 이름의 ${what}가 있어요`, { fields: [{ path: "name", rule: "unique", message: `이미 같은 이름의 ${what}가 있어요` }] });
  throw e;
};

export async function createCategory(ctx: Ctx, input: unknown) {
  const v = parse(categoryInput, input);
  return categoryRepo.create(ctx, { ...v, sort: await nextSort(finCategories, ctx) }).catch((e) => dup(e, "분류"));
}

/** 분류 편집: 이름 바꾸기(지난 지출도 새 이름으로 보임) */
export async function renameCategory(ctx: Ctx, id: string, name: string) {
  const cur = await categoryRepo.get(ctx, id);
  const v = parse(categoryInput, { kind: cur.kind, name });
  return categoryRepo.update(ctx, id, cur.version, { name: v.name }).catch((e) => dup(e, "분류"));
}

/** 분류 편집: 지우기(휴지통으로, 지난 지출은 이름 그대로). 같은 종류의 마지막 분류는 못 지움 */
export async function removeCategory(ctx: Ctx, id: string) {
  const cur = await categoryRepo.get(ctx, id);
  const left = await categoryRepo.list(ctx, { where: eq(finCategories.kind, cur.kind) });
  if (left.length <= 1) throw new AppError("VALIDATION_FAILED", "분류가 하나는 있어야 해요");
  await categoryRepo.remove(ctx, id);
}

/** 분류 편집: 순서 바꾸기(받은 순서대로 sort를 다시 매김) */
export async function reorderCategories(ctx: Ctx, ids: string[]) {
  if (ids.length > 200) throw new AppError("VALIDATION_FAILED", "순서를 저장할 수 없어요");
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(finCategories).set({ sort: i + 1, updatedAt: new Date() }).where(and(eq(finCategories.id, id), eq(finCategories.userId, ctx.userId)));
  });
}

export async function createPaymentMethod(ctx: Ctx, input: unknown) {
  const v = parse(paymentInput, input);
  return paymentRepo.create(ctx, { ...v, sort: await nextSort(paymentMethods, ctx) }).catch((e) => dup(e, "결제수단"));
}

/** 목록에 보일 이름(지운 분류·결제수단도 이름은 보이게) */
export async function nameMaps(ctx: Ctx) {
  const [cats, pms] = await Promise.all([
    db.select({ id: finCategories.id, name: finCategories.name }).from(finCategories).where(eq(finCategories.userId, ctx.userId)),
    db.select({ id: paymentMethods.id, name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.userId, ctx.userId)),
  ]);
  return { categories: Object.fromEntries(cats.map((c) => [c.id, c.name])), payments: Object.fromEntries(pms.map((p) => [p.id, p.name])) };
}

export { todayIn } from "./time.ts";

/** 화면으로 보낼 행(필요한 열만) */
export const toRow = (r: typeof transactions.$inferSelect) => ({
  id: r.id,
  version: r.version,
  type: r.type,
  amount: r.amount,
  currency: r.currency as Currency,
  foreignAmount: r.foreignAmount,
  isRefund: r.isRefund,
  restraint: r.restraint,
  date: r.date,
  categoryId: r.categoryId,
  paymentMethodId: r.paymentMethodId,
  title: r.title,
  memo: r.memo,
  tags: r.tags,
  plannedExpenseId: r.plannedExpenseId,
  payId: r.payId,
});
