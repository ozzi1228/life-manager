// 위시 분류: 이름만(드라마·영화·애니·뮤지컬·옷… 사용자가 추가·이름·순서·지우기, src/components/app/category-editor.tsx)
// 예전엔 분류마다 기록 방식(type)이 있었음 — 열은 남겨 두고 쓰지 않음. 작품 분류(scope media)는 0033 마이그레이션에서 위시로 합침
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { itemCategories, wishItems } from "../db/schema.ts";
import { AppError } from "./errors.ts";
import { dup } from "./finance.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const itemCategoryRepo = defineRepo(itemCategories, "item_category");

const DEFAULTS = ["물건", "영화", "드라마", "책"];
const nameOf = z.string().trim().min(1, "이름을 입력해 주세요").max(20, "이름은 20자까지 쓸 수 있어요");
const mine = eq(itemCategories.scope, "wish");

/** 기본 분류 만들기(한 번만: 지운 것까지 하나라도 있으면 건너뜀) */
async function ensure(ctx: Ctx) {
  const [any] = await db.select({ id: itemCategories.id }).from(itemCategories).where(and(eq(itemCategories.userId, ctx.userId), mine)).limit(1);
  if (any) return;
  await db.transaction(async (tx) => {
    for (const [i, name] of DEFAULTS.entries()) await itemCategoryRepo.create(ctx, { scope: "wish", name, type: "", sort: i }, { source: "default", tx });
  });
}

/** 분류 목록(순서대로) + 분류마다 담긴 수 */
export async function categoryList(ctx: Ctx) {
  await ensure(ctx);
  const list = await itemCategoryRepo.list(ctx, { where: mine, orderBy: [asc(itemCategories.sort), asc(itemCategories.createdAt)] });
  const counts = list.length
    ? await db
        .select({ id: wishItems.categoryId, n: count() })
        .from(wishItems)
        .where(and(eq(wishItems.userId, ctx.userId), isNull(wishItems.deletedAt), inArray(wishItems.categoryId, list.map((c) => c.id))))
        .groupBy(wishItems.categoryId)
    : [];
  return list.map((c) => ({ id: c.id, name: c.name, count: counts.find((x) => x.id === c.id)?.n ?? 0 }));
}
export type ItemCategory = Awaited<ReturnType<typeof categoryList>>[number];

/** 저장할 때: 고른 분류가 내 위시 분류인지(안 골랐으면 분류 없음) */
export async function checkCategory(ctx: Ctx, id: string | null | undefined) {
  if (!id) return null;
  const c = await itemCategoryRepo.get(ctx, id).catch(() => null);
  if (!c || c.scope !== "wish") throw new AppError("VALIDATION_FAILED", "분류를 다시 골라 주세요", { fields: [{ path: "categoryId", rule: "exists", message: "분류를 다시 골라 주세요" }] });
  return c.id;
}

export async function addItemCategory(ctx: Ctx, name: unknown) {
  const n = parse(nameOf, name);
  const list = await itemCategoryRepo.list(ctx, { where: mine });
  return itemCategoryRepo.create(ctx, { scope: "wish", name: n, type: "", sort: list.length }).catch((e) => dup(e, "분류"));
}

export async function renameItemCategory(ctx: Ctx, id: string, name: unknown) {
  const cur = await itemCategoryRepo.get(ctx, id);
  return itemCategoryRepo.update(ctx, id, cur.version, { name: parse(nameOf, name) }).catch((e) => dup(e, "분류"));
}

/** 지우기: 휴지통으로. 담긴 위시는 '전체'에만 보임. 마지막 하나는 못 지움 */
export async function removeItemCategory(ctx: Ctx, id: string) {
  await itemCategoryRepo.get(ctx, id);
  const left = await itemCategoryRepo.list(ctx, { where: mine });
  if (left.length <= 1) throw new AppError("VALIDATION_FAILED", "분류가 하나는 있어야 해요");
  await itemCategoryRepo.remove(ctx, id);
}

/** 순서 바꾸기(받은 순서대로 sort 0부터) */
export async function reorderItemCategories(ctx: Ctx, ids: string[]) {
  if (ids.length > 200) throw new AppError("VALIDATION_FAILED", "순서를 저장할 수 없어요");
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(itemCategories).set({ sort: i, updatedAt: new Date() }).where(and(eq(itemCategories.id, id), eq(itemCategories.userId, ctx.userId)));
  });
}
