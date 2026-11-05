"use server";

// 자산(계좌·카드·페이) 추가·수정·삭제 (SCR-FIN-08). 규칙은 src/server/cards.ts
import { action } from "@/server/api";
import { createAccount, createCard, createPay, removePaymentMethod, revealCard, updateAccount, updateCard, updatePay, type AccountInput, type CardInput, type PayInput } from "@/server/cards";

export async function addCard(input: CardInput) {
  return action(async (ctx) => ({ id: (await createCard(ctx, input)).id }));
}
export async function editCard(pmId: string, pmVersion: number, input: CardInput) {
  return action(async (ctx) => {
    await updateCard(ctx, pmId, pmVersion, input);
    return null;
  });
}
/** 카드번호·CVC·유효기간(암호화된 것을 풀어서) */
export async function showCardSecret(pmId: string) {
  return action((ctx) => revealCard(ctx, pmId));
}
export async function addPay(input: PayInput) {
  return action(async (ctx) => ({ id: (await createPay(ctx, input)).id }));
}
export async function editPay(pmId: string, pmVersion: number, input: PayInput) {
  return action(async (ctx) => {
    await updatePay(ctx, pmId, pmVersion, input);
    return null;
  });
}
export async function addAccount(input: AccountInput) {
  return action(async (ctx) => ({ id: (await createAccount(ctx, input)).id }));
}
export async function editAccount(pmId: string, pmVersion: number, input: AccountInput) {
  return action(async (ctx) => {
    await updateAccount(ctx, pmId, pmVersion, input);
    return null;
  });
}
export async function removePaymentAction(kind: "card" | "pay" | "account", pmId: string) {
  return action(async (ctx) => {
    await removePaymentMethod(ctx, kind, pmId);
    return null;
  });
}
