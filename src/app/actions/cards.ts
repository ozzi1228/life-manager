"use server";

// 카드·혜택 추가·수정·숨기기·삭제 (SCR-FIN-08~10). 규칙은 src/server/cards.ts
import { action } from "@/server/api";
import { addBenefit, benefitRepo, createCard, hideCard, updateBenefit, updateCard, type BenefitInput, type CardInput } from "@/server/cards";
import { restore } from "@/server/repo";

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
export async function addCardBenefit(pmId: string, input: BenefitInput) {
  return action(async (ctx) => ({ id: (await addBenefit(ctx, pmId, input)).id }));
}
export async function editCardBenefit(id: string, version: number, input: BenefitInput) {
  return action(async (ctx) => {
    await updateBenefit(ctx, id, version, input);
    return null;
  });
}
export async function deleteCardBenefit(id: string) {
  return action(async (ctx) => {
    await benefitRepo.remove(ctx, id);
    return null;
  });
}
export async function restoreCardBenefit(id: string) {
  return action((ctx) => restore(ctx, "card_benefit", id));
}
