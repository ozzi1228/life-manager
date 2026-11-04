"use server";

// 위시 담기·고치기·구매·그만둠 (SCR-WISH-01~04). 규칙은 src/server/wish.ts
import { action } from "@/server/api";
import { budgetEffect } from "@/server/budget";
import type { TxInput } from "@/server/finance";
import { once } from "@/server/idempotency";
import { addItemCategory, removeItemCategory, renameItemCategory, reorderItemCategories, setItemCategoryType, type Scope } from "@/server/item-categories";
import { restore } from "@/server/repo";
import { createWish, dropWish, purchaseWish, reopenWish, updateWish, wishRepo, type WishInput } from "@/server/wish";

export async function addWish(key: string, input: WishInput) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `wish:${key}`, JSON.stringify(input), async () => ({ status: 201, body: { id: (await createWish(ctx, input)).id } }));
    return body as { id: string };
  });
}
export async function editWish(id: string, version: number, input: WishInput) {
  return action(async (ctx) => ({ version: (await updateWish(ctx, id, version, input)).version }));
}
/** 구매함. tx가 있으면 지출도 만듦(지출 입력 화면에서) */
export async function buyWish(key: string, id: string, version: number, tx: TxInput | null) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `wish-buy:${key}`, JSON.stringify({ id, tx }), async () => {
      const r = await purchaseWish(ctx, id, version, tx);
      const t = r.transaction;
      return { status: 201, body: { id: t?.row.id ?? null, restraint: t?.restraint ?? false, budget: t ? await budgetEffect(ctx, t.row) : null } };
    });
    return body as { id: string | null; restraint: boolean; budget: { category: string; over: number } | null };
  });
}
/** 구매 되돌리기(토스트): 방금 만든 지출도 휴지통으로 */
export async function undoBuyWish(id: string) {
  return action(async (ctx) => {
    const w = await wishRepo.get(ctx, id);
    await reopenWish(ctx, id, w.version, true);
  });
}
export async function reopenWishAction(id: string, version: number, removeTx: boolean) {
  return action(async (ctx) => ({ version: (await reopenWish(ctx, id, version, removeTx)).version }));
}
export async function dropWishAction(id: string, version: number, reason: string | null, recordRestraint: boolean) {
  return action(async (ctx) => ({ version: (await dropWish(ctx, id, version, reason, recordRestraint)).version }));
}
export async function deleteWish(id: string) {
  return action(async (ctx) => {
    await wishRepo.remove(ctx, id);
  });
}
export async function restoreWish(id: string) {
  return action((ctx) => restore(ctx, "wish_item", id));
}

// ── 위시·작품 분류(분류 편집 창) ──
export async function addItemCat(scope: Scope, name: string) {
  return action(async (ctx) => void (await addItemCategory(ctx, scope, name)));
}
export async function renameItemCat(id: string, name: string) {
  return action(async (ctx) => void (await renameItemCategory(ctx, id, name)));
}
export async function setItemCatType(id: string, type: string) {
  return action((ctx) => setItemCategoryType(ctx, id, type));
}
export async function removeItemCat(id: string) {
  return action((ctx) => removeItemCategory(ctx, id));
}
export async function reorderItemCats(ids: string[]) {
  return action((ctx) => reorderItemCategories(ctx, ids));
}
