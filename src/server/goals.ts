// 목표·습관 트래커 서비스 (docs/planning/05, 15 §5)
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { goalCategories, goals, trackerCells, trackerItems, trackerMonthItems } from "../db/schema.ts";
import { validPeriodKey, type PeriodScope } from "../lib/period.ts";
import { GOAL_PALETTE } from "../lib/palette.ts";
import { AppError } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { todayIn } from "./time.ts";
import { parse } from "./validate.ts";

export const goalCategoryRepo = defineRepo(goalCategories, "goal_category");
export const goalRepo = defineRepo(goals, "goal");
export const itemRepo = defineRepo(trackerItems, "tracker_item");

const MONTH = /^\d{4}-\d{2}$/;
const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const checkMonth = (month: string) => {
  if (!MONTH.test(month)) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
};

// ── 트래커 ──

async function monthItems(ctx: Ctx, month: string) {
  return db
    .select({ id: trackerItems.id, version: trackerItems.version, name: trackerItems.name, colorHex: trackerItems.colorHex, goalId: trackerItems.goalId })
    .from(trackerMonthItems)
    .innerJoin(trackerItems, eq(trackerItems.id, trackerMonthItems.itemId))
    .where(and(eq(trackerMonthItems.userId, ctx.userId), eq(trackerMonthItems.month, month), isNull(trackerItems.deletedAt)))
    .orderBy(asc(trackerMonthItems.sort), asc(trackerItems.createdAt));
}

/** 한 달 화면: 항목, 칸, (이번 달이 비었으면) 지난달 항목 — 05 §4, 04 §5.1 */
export async function trackerMonth(ctx: Ctx, month: string) {
  checkMonth(month);
  const items = await monthItems(ctx, month);
  const cells = items.length
    ? await db
        .select({ itemId: trackerCells.itemId, date: trackerCells.date, done: trackerCells.done, memo: trackerCells.memo })
        .from(trackerCells)
        .where(
          and(
            eq(trackerCells.userId, ctx.userId),
            inArray(
              trackerCells.itemId,
              items.map((i) => i.id),
            ),
            gte(trackerCells.date, `${month}-01`),
            lte(trackerCells.date, `${month}-${lastDay(month)}`),
          ),
        )
    : [];
  const previous = items.length ? [] : await monthItems(ctx, prevMonth(month));
  return { month, days: lastDay(month), today: todayIn(), items, cells, previous };
}

async function nextMonthSort(ctx: Ctx, month: string) {
  const [r] = await db.select({ s: sql<number>`coalesce(max(${trackerMonthItems.sort}), 0) + 1` }).from(trackerMonthItems).where(and(eq(trackerMonthItems.userId, ctx.userId), eq(trackerMonthItems.month, month)));
  return r.s;
}

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "색을 다시 골라 주세요").transform((s) => s.toUpperCase());
export const itemInput = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요").max(60, "이름은 60자까지 쓸 수 있어요"),
  colorHex: hex,
});

/** 새 항목의 기본 색: 그 달에 아직 안 쓴 팔레트 색을 순서대로(05 §4.3) */
export async function suggestColor(ctx: Ctx, month: string) {
  const used = new Set((await monthItems(ctx, month)).map((i) => i.colorHex.toUpperCase()));
  return (GOAL_PALETTE.find((c) => !used.has(c.hex)) ?? GOAL_PALETTE[used.size % GOAL_PALETTE.length]).hex;
}

export async function addItem(ctx: Ctx, month: string, input: unknown) {
  checkMonth(month);
  const v = parse(itemInput, input);
  return db.transaction(async (tx) => {
    const item = await itemRepo.create(ctx, v, { tx });
    await tx.insert(trackerMonthItems).values({ userId: ctx.userId, itemId: item.id, month, sort: await nextMonthSort(ctx, month) });
    return item;
  });
}

export async function updateItem(ctx: Ctx, id: string, version: number, input: unknown) {
  return itemRepo.update(ctx, id, version, parse(itemInput, input));
}

/** 이번 달에서만 빼기(칸 기록은 보존) */
export async function removeFromMonth(ctx: Ctx, itemId: string, month: string) {
  checkMonth(month);
  await db.delete(trackerMonthItems).where(and(eq(trackerMonthItems.userId, ctx.userId), eq(trackerMonthItems.itemId, itemId), eq(trackerMonthItems.month, month)));
}

/** 이 달 항목 순서 바꾸기(드래그). 목록에 없는 항목은 건드리지 않음 */
export async function reorderMonth(ctx: Ctx, month: string, itemIds: unknown) {
  checkMonth(month);
  const ids = parse(z.array(z.uuid()).max(200), itemIds);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries())
      await tx
        .update(trackerMonthItems)
        .set({ sort: i + 1 })
        .where(and(eq(trackerMonthItems.userId, ctx.userId), eq(trackerMonthItems.month, month), eq(trackerMonthItems.itemId, id)));
  });
}

/** 지난달 항목 중 고른 것으로 이번 달 시작 */
export async function startMonthWith(ctx: Ctx, month: string, itemIds: string[]) {
  checkMonth(month);
  const mine = await itemRepo.list(ctx, { where: inArray(trackerItems.id, itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]) });
  let sort = await nextMonthSort(ctx, month);
  for (const id of itemIds) {
    if (!mine.some((i) => i.id === id)) continue; // 남의 것·지운 것은 건너뜀
    await db.insert(trackerMonthItems).values({ userId: ctx.userId, itemId: id, month, sort: sort++ }).onConflictDoNothing();
  }
}

export const cellInput = z.object({
  itemId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  done: z.boolean(),
  memo: z.string().trim().max(40, "메모는 40자까지 쓸 수 있어요").nullable().default(null),
});

/** 칸 저장(마지막 쓰기 우선). 미래 날짜는 고칠 수 없음, 빈 칸은 행을 지움 */
export async function setCell(ctx: Ctx, input: unknown) {
  const v = parse(cellInput, input);
  if (v.date > todayIn()) throw new AppError("BUSINESS_RULE", "앞으로 올 날은 체크할 수 없어요", { detail: { rule: "future_date" } });
  await itemRepo.get(ctx, v.itemId); // 내 항목인지
  const memo = v.memo || null;
  if (!v.done && !memo) {
    await db.delete(trackerCells).where(and(eq(trackerCells.userId, ctx.userId), eq(trackerCells.itemId, v.itemId), eq(trackerCells.date, v.date)));
    return { ...v, memo };
  }
  await db
    .insert(trackerCells)
    .values({ userId: ctx.userId, itemId: v.itemId, date: v.date, done: v.done, memo })
    .onConflictDoUpdate({ target: [trackerCells.itemId, trackerCells.date], set: { done: v.done, memo, updatedAt: new Date() } });
  return { ...v, memo };
}

// ── 결과 목표 ──

const DEFAULT_CATEGORIES = ["커리어", "자산", "다이어트", "건강", "독서", "학습", "생활", "관계"];

export async function goalCategoryList(ctx: Ctx) {
  const list = await goalCategoryRepo.list(ctx, { orderBy: [asc(goalCategories.sort)] });
  if (list.length) return list;
  const [any] = await db.select({ id: goalCategories.id }).from(goalCategories).where(eq(goalCategories.userId, ctx.userId)).limit(1);
  if (any) return list; // 사용자가 다 지운 경우 다시 만들지 않음
  await db.transaction(async (tx) => {
    for (const [i, name] of DEFAULT_CATEGORIES.entries()) await goalCategoryRepo.create(ctx, { name, sort: i }, { source: "default", tx });
  });
  return goalCategoryRepo.list(ctx, { orderBy: [asc(goalCategories.sort)] });
}

const year = z.number().int().min(2000).max(2100);
const goalTitle = z.string().trim().min(1, "목표를 입력해 주세요").max(60, "목표는 60자까지 쓸 수 있어요");
export const goalInput = z
  .object({
    title: goalTitle,
    horizon: z.enum(["short", "mid", "long"]),
    startYear: year.nullable().default(null),
    endYear: year.nullable().default(null),
    categoryId: z.uuid().nullable().default(null),
    memo: z.string().trim().max(1000).nullable().default(null),
    // 월·주·일 목표(D-072). 있으면 연도는 비움
    periodScope: z.enum(["month", "week", "day"]).nullable().default(null),
    periodKey: z.string().nullable().default(null),
  })
  .refine((g) => (g.startYear === null) === (g.endYear === null) && (g.startYear === null || g.startYear <= (g.endYear as number)), {
    message: "기간을 다시 골라 주세요",
    path: ["endYear"],
  })
  .refine((g) => (g.periodScope === null ? g.periodKey === null : g.startYear === null && g.periodKey !== null && validPeriodKey(g.periodScope, g.periodKey)), {
    message: "기간을 다시 골라 주세요",
    path: ["periodKey"],
  });

async function checkCategory(ctx: Ctx, categoryId: string | null) {
  if (categoryId && !(await goalCategoryRepo.get(ctx, categoryId).catch(() => null)))
    throw new AppError("VALIDATION_FAILED", "카테고리를 다시 골라 주세요", { fields: [{ path: "categoryId", rule: "exists", message: "카테고리를 다시 골라 주세요" }] });
}

export async function createGoal(ctx: Ctx, input: unknown) {
  const v = parse(goalInput, input);
  await checkCategory(ctx, v.categoryId);
  return goalRepo.create(ctx, { ...v, memo: v.memo || null });
}

export async function updateGoal(ctx: Ctx, id: string, version: number, input: unknown) {
  const v = parse(goalInput, input);
  await checkCategory(ctx, v.categoryId);
  return goalRepo.update(ctx, id, version, { ...v, memo: v.memo || null });
}

/** 이름만 고치기(일정 화면 목표 카드에서 글자를 두 번 눌러) */
export const renameGoal = async (ctx: Ctx, id: string, version: number, title: unknown) => goalRepo.update(ctx, id, version, { title: parse(goalTitle, title) });

/** 달성·진행 중·보류·포기. 달성하면 오늘 날짜를 달성일로 */
export async function setGoalStatus(ctx: Ctx, id: string, version: number, status: "active" | "done" | "paused" | "dropped") {
  if (!["active", "done", "paused", "dropped"].includes(status)) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
  return goalRepo.update(ctx, id, version, { status, achievedAt: status === "done" ? todayIn() : null });
}

/** 기간 목표 빠른 추가(목표 화면·일정 화면). 연은 그 해 한 해짜리 단기 목표, 월·주·일은 그 기간 목표 */
export async function createPeriodGoal(ctx: Ctx, scope: PeriodScope, key: string, title: unknown) {
  if (!["year", "month", "week", "day"].includes(scope) || !validPeriodKey(scope, key)) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
  const y = scope === "year" ? Number(key) : null;
  return createGoal(ctx, { title, horizon: "short", startYear: y, endYear: y, periodScope: scope === "year" ? null : scope, periodKey: scope === "year" ? null : key });
}

/** 그 기간의 목표(일정 화면). 연은 기간에 그 해가 든 연 목표, 월·주·일은 그 기간 목표. 보류·포기는 뺌 */
export async function periodGoals(ctx: Ctx, scope: PeriodScope, key: string) {
  if (!validPeriodKey(scope, key)) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
  const where =
    scope === "year"
      ? and(isNull(goals.periodScope), lte(goals.startYear, Number(key)), gte(goals.endYear, Number(key)))
      : and(eq(goals.periodScope, scope), eq(goals.periodKey, key));
  const list = await goalRepo.list(ctx, { where: and(where, inArray(goals.status, ["active", "done"])), orderBy: [asc(goals.sort), asc(goals.createdAt)], limit: 500 });
  return list.map(toGoal);
}

/** 목표 화면 월별·주간·일간: 그 단위의 목표 전부 */
export async function periodGoalList(ctx: Ctx, scope: "month" | "week" | "day") {
  return (await goalRepo.list(ctx, { where: eq(goals.periodScope, scope), orderBy: [asc(goals.sort), asc(goals.createdAt)], limit: 1000 })).map(toGoal);
}

/** yearOnly: 연·미정 목표만(월·주·일 목표 빼고) — 전체 목표·연도별 화면(D-072) */
export async function goalList(ctx: Ctx, yearOnly = false) {
  return goalRepo.list(ctx, { where: yearOnly ? isNull(goals.periodScope) : undefined, orderBy: [asc(goals.sort), asc(goals.createdAt)], limit: 1000 });
}

/** 화면으로 보낼 목표(필요한 열만) */
export const toGoal = (g: typeof goals.$inferSelect) => ({
  id: g.id,
  version: g.version,
  title: g.title,
  horizon: g.horizon,
  startYear: g.startYear,
  endYear: g.endYear,
  categoryId: g.categoryId,
  status: g.status,
  achievedAt: g.achievedAt,
  memo: g.memo,
  periodScope: g.periodScope,
  periodKey: g.periodKey,
});
