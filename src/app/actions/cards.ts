"use server";

// 결제 수단(카드·페이·계좌) 추가·수정·숨기기 (SCR-FIN-08). 규칙은 src/server/cards.ts
import { action } from "@/server/api";
import { createAccount, createCard, createPay, hidePaymentMethod, updateAccount, updateCard, updatePay, type AccountInput, type CardInput, type PayInput } from "@/server/cards";

export async function addCard(input: CardInput) {
  return action(async (ctx) => ({ id: (await createCard(ctx, input)).id }));
}
export async function editCard(pmId: string, pmVersion: number, input: CardInput) {
  return action(async (ctx) => {
    await updateCard(ctx, pmId, pmVersion, input);
    return null;
  });
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
export async function hidePaymentAction(kind: "card" | "pay" | "account", pmId: string, version: number) {
  return action(async (ctx) => {
    await hidePaymentMethod(ctx, kind, pmId, version);
    return null;
  });
}
