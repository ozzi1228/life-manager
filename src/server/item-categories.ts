// 위시(쇼핑)·작품 분류: 추가·이름·순서·지우기(src/components/app/category-editor.tsx)
// 분류마다 기록 방식(type) 하나: wish = need|want|like, media = book|movie|drama. 항목의 level·kind는 고른 분류의 type을 따름
// 처음 열 때 지금까지 쓰던 이름으로 기본 분류를 만들고, 분류 없던 항목을 type이 같은 분류에 넣음
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { itemCategories, mediaWorks, wishItems } from "../db/schema.ts";
import { AppError } from "./errors.ts";
import { dup } from "./finance.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const itemCategoryRepo = defineRepo(itemCategories, "item_category");

export type Scope = "wish" | "media";
export const TYPES = { wish: ["need", "want", "like"], media: ["book", "movie", "drama"] } as const;
const DEFAULTS: Record<Scope, { name: string; type: string }[]> = {
  wish: [
    { name: "필요", type: "need" },
    { name: "갖고 싶음", type: "want" },
    { name: "관심", type: "like" },
  ],
  media: [
    { name: "책", type: "book" },
    { name: "영화", type: "movie" },
    { name: "드라마", type: "drama" },
  ],
};

const scopeOf = z.enum(["wish", "media"]);
const nameOf = z.string().trim().min(1, "이름을 입력해 주세요").max(20, "이름은 20자까지 쓸 수 있어요");

/** 기본 분류 만들기(한 번만: 지운 것까지 하나라도 있으면 건너뜀) + 분류 없는 항목 채우기 */
async function ensure(ctx: Ctx, scope: Scope) {
  const [any] = await db.select({ id: itemCategories.id }).from(itemCategories).where(and(eq(itemCategories.userId, ctx.userId), eq(itemCategories.scope, scope))).limit(1);
  if (any) return;
  await db.transaction(async (tx) => {
    for (const [i, d] of DEFAULTS[scope].entries()) {
      const c = await itemCategoryRepo.create(ctx, { scope, ...d, sort: i }, { source: "default", tx });
      if (scope === "wish") await tx.update(wishItems).set({ categoryId: c.id }).where(and(eq(wishItems.userId, ctx.userId), eq(wishItems.kind, "shopping"), eq(wishItems.level, d.type as "need"), isNull(wishItems.categoryId)));
      else await tx.update(mediaWorks).set({ categoryId: c.id }).where(and(eq(mediaWorks.userId, ctx.userId), eq(mediaWorks.kind, d.type as "book"), isNull(mediaWorks.categoryId)));
    }
  });
}

/** 분류 목록(순서대로) + 분류마다 항목 수 */
export async function categoryList(ctx: Ctx, scope: Scope) {
  await ensure(ctx, scope);
  const list = await itemCategoryRepo.list(ctx, { where: eq(itemCategories.scope, scope), orderBy: [asc(itemCategories.sort), asc(itemCategories.createdAt)] });
  const t = scope === "wish" ? wishItems : mediaWorks;
  const counts = list.length
    ? await db
        .select({ id: t.categoryId, n: count() })
        .from(t)
        .where(and(eq(t.userId, ctx.userId), isNull(t.deletedAt), inArray(t.categoryId, list.map((c) => c.id))))
        .groupBy(t.categoryId)
    : [];
  return list.map((c) => ({ id: c.id, name: c.name, type: c.type, count: counts.find((x) => x.id === c.id)?.n ?? 0 }));
}
export type ItemCategory = Awaited<ReturnType<typeof categoryList>>[number];

/** 저장할 때: 고른 분류(내 것·같은 scope)의 type을 돌려줌. 안 골랐으면 type이 같은 첫 분류 */
export async function resolveCategory(ctx: Ctx, scope: Scope, id: string | null | undefined, type: string) {
  if (id) {
    const c = await itemCategoryRepo.get(ctx, id).catch(() => null);
    if (!c || c.scope !== scope) throw new AppError("VALIDATION_FAILED", "분류를 다시 골라 주세요", { fields: [{ path: "categoryId", rule: "exists", message: "분류를 다시 골라 주세요" }] });
    return { categoryId: c.id, type: c.type };
  }
  await ensure(ctx, scope);
  const [c] = await db
    .select({ id: itemCategories.id })
    .from(itemCategories)
    .where(and(eq(itemCategories.userId, ctx.userId), eq(itemCategories.scope, scope), eq(itemCategories.type, type), isNull(itemCategories.deletedAt)))
    .orderBy(asc(itemCategories.sort))
    .limit(1);
  return { categoryId: c?.id ?? null, type };
}

export async function addItemCategory(ctx: Ctx, scope: unknown, name: unknown) {
  const s = parse(scopeOf, scope);
  const n = parse(nameOf, name);
  const list = await itemCategoryRepo.list(ctx, { where: eq(itemCategories.scope, s) });
  // 새 분류의 기록 방식은 위시 '관심', 작품 '책'으로 시작 — 편집 창에서 바꿈
  const type = s === "wish" ? "like" : "book";
  return itemCategoryRepo.create(ctx, { scope: s, name: n, type, sort: list.length }).catch((e) => dup(e, "분류"));
}

export async function renameItemCategory(ctx: Ctx, id: string, name: unknown) {
  const cur = await itemCategoryRepo.get(ctx, id);
  return itemCategoryRepo.update(ctx, id, cur.version, { name: parse(nameOf, name) }).catch((e) => dup(e, "분류"));
}

/** 기록 방식 바꾸기. 위시는 담긴 항목의 level도 함께, 작품은 기록이 없을 때만(영화·책은 입력 칸이 달라서) */
export async function setItemCategoryType(ctx: Ctx, id: string, type: string) {
  const cur = await itemCategoryRepo.get(ctx, id);
  if (!(TYPES[cur.scope] as readonly string[]).includes(type)) throw new AppError("VALIDATION_FAILED", "기록 방식을 다시 골라 주세요");
  if (cur.type === type) return;
  if (cur.scope === "media") {
    const [{ n }] = await db.select({ n: count() }).from(mediaWorks).where(and(eq(mediaWorks.userId, ctx.userId), eq(mediaWorks.categoryId, id), isNull(mediaWorks.deletedAt)));
    if (n) throw new AppError("VALIDATION_FAILED", "기록이 있는 분류는 책·영화·드라마를 바꿀 수 없어요. 새 분류를 만들어 주세요");
  }
  await db.transaction(async (tx) => {
    await itemCategoryRepo.update(ctx, id, cur.version, { type }, { tx });
    if (cur.scope === "wish") await tx.update(wishItems).set({ level: type as "need", updatedAt: new Date() }).where(and(eq(wishItems.userId, ctx.userId), eq(wishItems.categoryId, id)));
  });
}

/** 지우기: 휴지통으로. 담긴 항목은 '전체'에만 보임(기록 방식은 그대로). 마지막 하나는 못 지움 */
export async function removeItemCategory(ctx: Ctx, id: string) {
  const cur = await itemCategoryRepo.get(ctx, id);
  const left = await itemCategoryRepo.list(ctx, { where: eq(itemCategories.scope, cur.scope) });
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
