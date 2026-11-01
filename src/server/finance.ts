// 돈 서비스 (docs/planning/06 §3, 15 §6). 화면(Server Action)과 이후 /api/v1이 함께 씀
import { and, asc, desc, eq, gte, isNull, lt, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { finCategories, paymentMethods, transactions } from "../db/schema.ts";
import { parse } from "./validate.ts";
import { AppError } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";

export const categoryRepo = defineRepo(finCategories, "fin_category");
export const paymentRepo = defineRepo(paymentMethods, "payment_method");
export const txRepo = defineRepo(transactions, "transaction");

// 기본 분류(04 §6.13). 사치만 참은 소비에 포함(20 §3)
const DEFAULT_EXPENSE = ["식비", "카페·간식", "교통", "쇼핑", "사치", "생활", "문화·여가", "건강·의료", "교육", "경조사·선물", "여행", "구독·고정", "기타"];
const DEFAULT_INCOME = ["급여", "용돈", "부수입", "환급", "기타 수입"];

/** 처음 쓸 때 기본 분류·결제수단(현금)을 만듦. 이미 있으면 아무것도 안 함 */
async function ensureDefaults(ctx: Ctx) {
  const [has] = await db.select({ id: finCategories.id }).from(finCategories).where(eq(finCategories.userId, ctx.userId)).limit(1);
  if (has) return;
  await db.transaction(async (tx) => {
    const rows = [
      ...DEFAULT_EXPENSE.map((name, i) => ({ kind: "expense" as const, name, sort: i, countsTowardRestraint: name === "사치" })),
      ...DEFAULT_INCOME.map((name, i) => ({ kind: "income" as const, name, sort: i })),
    ];
    for (const r of rows) await categoryRepo.create(ctx, r, { source: "default", tx });
    await paymentRepo.create(ctx, { kind: "cash", name: "현금" }, { source: "default", tx });
  });
}

/** 입력 화면용: 분류(최근 쓴 순 → 기본 순서), 결제수단(최근 쓴 순), 마지막 쓴 결제수단 */
export async function formData(ctx: Ctx) {
  await ensureDefaults(ctx);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const lastUse = (col: typeof transactions.categoryId | typeof transactions.paymentMethodId) =>
    db
      .select({ id: col, last: max(transactions.createdAt) })
      .from(transactions)
      .where(and(eq(transactions.userId, ctx.userId), isNull(transactions.deletedAt), gte(transactions.date, since)))
      .groupBy(col);
  const [cats, pms, catUse, pmUse] = await Promise.all([
    categoryRepo.list(ctx, { where: eq(finCategories.isHidden, false), orderBy: [asc(finCategories.sort)] }),
    paymentRepo.list(ctx, { where: eq(paymentMethods.isHidden, false), orderBy: [asc(paymentMethods.sort), asc(paymentMethods.createdAt)] }),
    lastUse(transactions.categoryId),
    lastUse(transactions.paymentMethodId),
  ]);
  const recent = (uses: { id: string | null; last: Date | null }[]) => new Map(uses.map((u) => [u.id, u.last?.getTime() ?? 0]));
  const byRecent = <T extends { id: string; sort: number }>(list: T[], use: Map<string | null, number>) =>
    [...list].sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0) || a.sort - b.sort);
  const pmRecent = recent(pmUse);
  const orderedPm = byRecent(pms, pmRecent);
  return {
    categories: byRecent(cats, recent(catUse)).map((c) => ({ id: c.id, kind: c.kind, name: c.name, restraint: c.countsTowardRestraint })),
    paymentMethods: orderedPm.map((p) => ({ id: p.id, kind: p.kind, name: p.name })),
    lastPaymentMethodId: pmRecent.size ? orderedPm[0]?.id ?? null : null,
  };
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 선택해 주세요");
export const txInput = z.object({
  type: z.enum(["expense", "income"]),
  amount: z.number({ error: "금액을 입력해 주세요" }).int().min(1, "1원 이상 입력해 주세요").max(10_000_000_000, "100억 원까지 입력할 수 있어요"),
  isRefund: z.boolean().default(false),
  date: ymd,
  categoryId: z.uuid({ error: "분류를 골라 주세요" }),
  paymentMethodId: z.uuid().nullable().default(null),
  title: z.string().trim().max(60, "내용은 60자까지 쓸 수 있어요").nullable().default(null),
  memo: z.string().trim().max(1000).nullable().default(null),
});
export type TxInput = z.input<typeof txInput>;

/** 분류·결제수단이 내 것이고 종류가 맞는지(교차 사용자 참조 방지, 14 §7) */
async function checkRefs(ctx: Ctx, v: { type: string; categoryId: string; paymentMethodId: string | null }) {
  const cat = await categoryRepo.get(ctx, v.categoryId).catch(() => null);
  if (!cat || cat.kind !== v.type) throw new AppError("VALIDATION_FAILED", "분류를 골라 주세요", { fields: [{ path: "categoryId", rule: "exists", message: "분류를 골라 주세요" }] });
  if (v.paymentMethodId && !(await paymentRepo.get(ctx, v.paymentMethodId).catch(() => null)))
    throw new AppError("VALIDATION_FAILED", "결제수단을 다시 골라 주세요", { fields: [{ path: "paymentMethodId", rule: "exists", message: "결제수단을 다시 골라 주세요" }] });
  return cat;
}

const clean = (v: z.infer<typeof txInput>) => ({ ...v, title: v.title || null, memo: v.memo || null, isRefund: v.type === "expense" && v.isRefund });

export async function createTransaction(ctx: Ctx, input: unknown) {
  const v = clean(parse(txInput, input));
  const cat = await checkRefs(ctx, v);
  const row = await txRepo.create(ctx, v);
  return { row, restraint: v.type === "expense" && !v.isRefund && cat.countsTowardRestraint };
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
const dup = (e: unknown, what: string) => {
  if ((e as { cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string })?.code === "23505")
    throw new AppError("DUPLICATE", `이미 같은 이름의 ${what}가 있어요`, { fields: [{ path: "name", rule: "unique", message: `이미 같은 이름의 ${what}가 있어요` }] });
  throw e;
};

export async function createCategory(ctx: Ctx, input: unknown) {
  const v = parse(categoryInput, input);
  return categoryRepo.create(ctx, { ...v, sort: await nextSort(finCategories, ctx) }).catch((e) => dup(e, "분류"));
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
  isRefund: r.isRefund,
  date: r.date,
  categoryId: r.categoryId,
  paymentMethodId: r.paymentMethodId,
  title: r.title,
  memo: r.memo,
});
