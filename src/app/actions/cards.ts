"use server";

// 카드 추가·수정·숨기기 (SCR-FIN-08). 규칙은 src/server/cards.ts
import { action } from "@/server/api";
import { createCard, hideCard, updateCard, type CardInput } from "@/server/cards";

export async function addCard(input: CardInput) {
  return action(async (ctx) => ({ id: (await createCard(ctx, input)).id }));
}
export async function editCard(pmId: string, pmVersion: number, input: CardInput) {
  return action(async (ctx) => {
    await updateCard(ctx, pmId, pmVersion, input);
    return null;
  });
}
export async function hideCardAction(pmId: string, version: number) {
  return action(async (ctx) => {
    await hideCard(ctx, pmId, version);
    return null;
  });
}
