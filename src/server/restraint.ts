// 참은 소비 서비스 (docs/planning/20, 15 §6). 계산은 src/lib/restraint.ts
// 이번 달: 지출이 바뀔 때마다 읽을 때 계산. 지난 달: 월 정산 때 고정(restraint_months)
// 월 정산은 화면을 열 때 밀린 달부터 차례로 따라잡음(20 §6: PC가 꺼져 있었어도 켜지면 따라잡기)
// ponytail: 매달 1일 예약 작업·정산 알림은 M-21에서. 정산 뒤 7일 수정 기한 없음 — 바뀌면 "다시 정산"
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/index.ts";
import { restraintEntries, restraintMonths, wishItems } from "../db/schema.ts";
import { restraintTarget } from "../lib/restraint.ts";
import { budgetView, nextMonth, prevMonth } from "./budget.ts";
import { AppError } from "./errors.ts";
import { nameMaps } from "./finance.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { todayIn } from "./time.ts";
import { parse } from "./validate.ts";

export const restraintEntryRepo = defineRepo(restraintEntries, "restraint_entry");
export const restraintMonthRepo = defineRepo(restraintMonths, "restraint_month");

const isDup = (e: unknown) => (e as { cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string })?.code === "23505";
const checkMonth = (m: string) => {
  if (!/^\d{4}-\d{2}$/.test(m)) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
};

const entriesOf = (ctx: Ctx, month: string) => restraintEntryRepo.list(ctx, { where: eq(restraintEntries.month, month), orderBy: [desc(restraintEntries.date), desc(restraintEntries.createdAt)], limit: 1000 });
const monthRow = async (ctx: Ctx, month: string) => (await restraintMonthRepo.list(ctx, { where: eq(restraintMonths.month, month), limit: 1 }))[0] ?? null;

/** 참은 소비로 센 위시(빼기 한 것 제외) → 위시 id별 기록 */
async function countedWishes(ctx: Ctx, wishIds?: string[]) {
  const rows = await db
    .select({ wishItemId: restraintEntries.wishItemId, month: restraintEntries.month, status: restraintEntries.status })
    .from(restraintEntries)
    .where(and(eq(restraintEntries.userId, ctx.userId), isNull(restraintEntries.deletedAt), ne(restraintEntries.status, "excluded"), wishIds ? inArray(restraintEntries.wishItemId, wishIds) : undefined));
  return new Map(rows.filter((r) => r.wishItemId).map((r) => [r.wishItemId!, { month: r.month, status: r.status }]));
}

const shoppingWishes = (ctx: Ctx) =>
  db
    .select()
    .from(wishItems)
    .where(and(eq(wishItems.userId, ctx.userId), eq(wishItems.kind, "shopping"), isNull(wishItems.deletedAt)))
    .orderBy(asc(wishItems.createdAt));

/** 한 달 참아야 할 금액(내역)·참은 금액을 지금 데이터로 계산 */
async function compute(ctx: Ctx, month: string, carriedIn: number) {
  const [view, entries, later] = await Promise.all([
    budgetView(ctx, month),
    entriesOf(ctx, month),
    restraintEntryRepo.list(ctx, { where: and(eq(restraintEntries.boughtMonth, month), eq(restraintEntries.status, "later_bought")), limit: 1000 }),
  ]);
  const d = restraintTarget({
    txs: view.txs.map((t) => ({ amount: Math.abs(t.amount), isRefund: t.amount < 0, date: t.date, categoryId: t.categoryId, restraint: t.restraint })),
    categories: view.summary.categories,
    carriedIn,
    laterBought: later.reduce((a, e) => a + e.amount, 0),
    today: todayIn(),
  });
  const filled = entries.filter((e) => e.status !== "excluded").reduce((a, e) => a + e.amount, 0);
  return { ...d, filled, entries, later, hasBudget: Object.keys(view.budget?.lines ?? {}).length > 0 };
}

/** 월 정산(20 §6): 계산 → 저장. row가 있으면 다시 정산. 위시 자동 포함은 없앰(참은 것은 직접 기록) */
async function settle(ctx: Ctx, month: string, carriedIn: number, row?: typeof restraintMonths.$inferSelect | null) {
  const c = await compute(ctx, month, carriedIn);
  const values = { month, target: c.target, filled: c.filled, carriedIn, carryOut: Math.max(0, c.target - c.filled), detail: { luxury: c.luxury, overage: c.overage, laterBought: c.laterBought } };
  if (row) return restraintMonthRepo.update(ctx, row.id, row.version, values);
  return restraintMonthRepo.create(ctx, values, { source: "job" }).catch(async (e) => {
    if (!isDup(e)) throw e;
    return (await monthRow(ctx, month))!;
  });
}

/** 밀린 정산 따라잡기: 마지막 정산 다음 달(처음이면 지난달)부터 지난달까지 */
export async function catchUp(ctx: Ctx) {
  const cur = todayIn().slice(0, 7);
  const [last] = await restraintMonthRepo.list(ctx, { orderBy: [desc(restraintMonths.month)], limit: 1 });
  let m = last ? nextMonth(last.month) : prevMonth(cur);
  let carried = last?.carryOut ?? 0;
  for (let i = 0; m < cur && i < 36; i++, m = nextMonth(m)) carried = (await settle(ctx, m, carried)).carryOut;
}

/** 다시 정산: 이 달부터 정산된 마지막 달까지 차례로(넘긴 금액이 이어지게) */
export async function resettle(ctx: Ctx, month: string) {
  checkMonth(month);
  const rows = await restraintMonthRepo.list(ctx, { orderBy: [asc(restraintMonths.month)], limit: 1000 });
  const from = rows.findIndex((r) => r.month === month);
  if (from < 0) throw new AppError("NOT_FOUND", "정산한 달이 아니에요");
  let carried = rows[from].carriedIn;
  for (const r of rows.slice(from)) carried = (await settle(ctx, r.month, carried, r)).carryOut;
}

/** 참은 소비 화면(SCR-FIN-14) */
export async function restraintView(ctx: Ctx, month: string) {
  checkMonth(month);
  await catchUp(ctx);
  const cur = todayIn().slice(0, 7);
  const [row, prev, names] = await Promise.all([month < cur ? monthRow(ctx, month) : null, monthRow(ctx, prevMonth(month)), nameMaps(ctx)]);
  const carriedIn = row ? row.carriedIn : month === cur ? (prev?.carryOut ?? 0) : 0;
  const live = await compute(ctx, month, carriedIn);
  const shown = row ? { target: row.target, filled: row.filled, carriedIn: row.carriedIn, ...row.detail } : live;

  // "위시에서 고르기" 목록: 담아 둔 것 중 가격 있고 아직 안 센 것
  const [wishes, counted] = await Promise.all([shoppingWishes(ctx), countedWishes(ctx)]);
  const saved = wishes.filter((w) => w.status === "saved" && w.price && !counted.has(w.id));

  return {
    month,
    current: month === cur,
    closed: !!row,
    stale: !!row && (row.target !== live.target || row.filled !== live.filled),
    target: shown.target,
    filled: shown.filled,
    carryOut: row?.carryOut ?? null,
    detail: { luxury: shown.luxury, overage: shown.overage.map((o) => ({ ...o, name: names.categories[o.categoryId] ?? "지운 분류" })), carriedIn: shown.carriedIn, laterBought: shown.laterBought },
    hasBudget: live.hasBudget,
    entries: live.entries.map((e) => ({ id: e.id, version: e.version, date: e.date, origin: e.origin, wishItemId: e.wishItemId, name: e.name, amount: e.amount, reason: e.reason, status: e.status, boughtMonth: e.boughtMonth })),
    later: live.later.map((e) => ({ id: e.id, name: e.name, amount: e.amount, month: e.month })),
    pickable: saved.map((w) => ({ id: w.id, name: w.name, price: w.price })),
  };
}
export type RestraintView = Awaited<ReturnType<typeof restraintView>>;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 선택해 주세요");
export const restraintInput = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요").max(100, "이름은 100자까지 쓸 수 있어요"),
  amount: z.number({ error: "금액을 입력해 주세요" }).int().min(1, "금액을 입력해 주세요").max(10_000_000_000, "100억 원까지 입력할 수 있어요"),
  date: ymd,
  reason: z.string().trim().max(1000).nullable().default(null),
  wishItemId: z.uuid().nullable().default(null),
});
export type RestraintInput = z.input<typeof restraintInput>;

const already = () => new AppError("DUPLICATE", "이미 참은 소비로 기록된 위시예요");

/** 직접 기록. 위시에서 고르면 그 위시는 자동 포함 대상에서 빠짐(이중 계산 방지) */
export async function createRestraint(ctx: Ctx, input: unknown) {
  const v = parse(restraintInput, input);
  if (v.wishItemId) {
    const [w] = await db
      .select({ kind: wishItems.kind })
      .from(wishItems)
      .where(and(eq(wishItems.userId, ctx.userId), eq(wishItems.id, v.wishItemId), isNull(wishItems.deletedAt)));
    if (w?.kind !== "shopping") throw new AppError("VALIDATION_FAILED", "위시를 다시 골라 주세요");
  }
  return restraintEntryRepo.create(ctx, { ...v, reason: v.reason || null, month: v.date.slice(0, 7), origin: v.wishItemId ? "wish_picked" : "manual" }).catch((e) => {
    throw isDup(e) ? already() : e;
  });
}

export async function updateRestraint(ctx: Ctx, id: string, version: number, input: unknown) {
  const v = parse(restraintInput, input);
  const cur = await restraintEntryRepo.get(ctx, id);
  if (cur.origin === "wish_auto") throw new AppError("BAD_REQUEST", "위시에서 자동으로 들어온 기록은 빼기만 할 수 있어요");
  return restraintEntryRepo.update(ctx, id, version, { name: v.name, amount: v.amount, date: v.date, month: v.date.slice(0, 7), reason: v.reason || null });
}

/** 위시 자동 항목을 이 달에서 빼기·다시 넣기(20 §4.2). 뺀 위시는 다시 대상이 됨 */
export async function setExcluded(ctx: Ctx, id: string, version: number, excluded: boolean) {
  const cur = await restraintEntryRepo.get(ctx, id);
  if (cur.origin !== "wish_auto") throw new AppError("BAD_REQUEST", "위시에서 자동으로 들어온 기록만 뺄 수 있어요");
  return restraintEntryRepo.update(ctx, id, version, { status: excluded ? "excluded" : "counted" }).catch((e) => {
    throw isDup(e) ? already() : e;
  });
}

// ── 위시와 연결 (09 §6, 20 §4.1·5.3). 위시 서비스가 자기 트랜잭션 안에서 부름 ──

/** 위시를 그만둘 때 참은 소비로 기록(이번 달). 이미 센 위시면 그대로 */
export async function recordDropped(ctx: Ctx, tx: Tx, w: { id: string; name: string; price: number | null }) {
  if (!w.price || (await countedWishes(ctx, [w.id])).has(w.id)) return null;
  const today = todayIn();
  return restraintEntryRepo.create(ctx, { month: today.slice(0, 7), date: today, origin: "wish_dropped", wishItemId: w.id, name: w.name, amount: w.price }, { tx });
}

/** 참았다고 기록한 위시를 샀음 → "나중에 샀어요", 산 달의 참아야 할 금액에 더해짐(D-041). undo면 되돌림 */
export async function markLaterBought(ctx: Ctx, tx: Tx, wishId: string, boughtMonth: string | null) {
  const rows = await tx
    .select()
    .from(restraintEntries)
    .where(and(eq(restraintEntries.userId, ctx.userId), eq(restraintEntries.wishItemId, wishId), isNull(restraintEntries.deletedAt), inArray(restraintEntries.status, boughtMonth ? ["counted"] : ["later_bought"])));
  for (const r of rows) await restraintEntryRepo.update(ctx, r.id, r.version, boughtMonth ? { status: "later_bought", boughtMonth } : { status: "counted", boughtMonth: null }, { tx });
}

/** 위시 카드 표시용: 위시 id → 참은 소비로 센 달 */
export const restrainedOf = countedWishes;
