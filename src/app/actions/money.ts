"use server";

// 지출 입력·수정·삭제 (SCR-FIN-03). 규칙은 서비스 계층(src/server/finance.ts)에
import { action } from "@/server/api";
import { budgetEffect } from "@/server/budget";
import { createCategory, createPaymentMethod, createTransaction, formData, txRepo, updateTransaction, type TxInput } from "@/server/finance";
import { once } from "@/server/idempotency";
import { restore } from "@/server/repo";

export async function expenseFormData() {
  return action((ctx) => formData(ctx));
}

/** 새로 만들기는 화면이 만든 key로 한 번만(두 번 탭·재전송 방지, 15 §2.4) */
export async function addTransaction(key: string, input: TxInput) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `tx:${key}`, JSON.stringify(input), async () => {
      const { row, restraint } = await createTransaction(ctx, input);
      const budget = row.type === "expense" ? await budgetEffect(ctx, row) : null;
      return { status: 201, body: { id: row.id, restraint, budget } };
    });
    return body as { id: string; restraint: boolean; budget: { category: string; over: number } | null };
  });
}

export async function editTransaction(id: string, version: number, input: TxInput) {
  return action(async (ctx) => {
    const row = await updateTransaction(ctx, id, version, input);
    return { id: row.id, version: row.version };
  });
}

export async function removeTransaction(id: string) {
  return action(async (ctx) => {
    await txRepo.remove(ctx, id);
    return { id };
  });
}

export async function restoreTransaction(id: string) {
  return action((ctx) => restore(ctx, "transaction", id));
}

export async function addCategory(kind: "expense" | "income", name: string) {
  return action(async (ctx) => {
    const c = await createCategory(ctx, { kind, name });
    return { id: c.id, kind: c.kind, name: c.name, restraint: c.countsTowardRestraint };
  });
}

export async function addPaymentMethod(kind: "card" | "account" | "cash" | "pay", name: string) {
  return action(async (ctx) => {
    const p = await createPaymentMethod(ctx, { kind, name });
    return { id: p.id, kind: p.kind, name: p.name };
  });
}
