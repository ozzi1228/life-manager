"use server";

// 고정 지출 추가·수정·해지 (SCR-FIN-06·07). 규칙은 src/server/recurring.ts
import { action } from "@/server/api";
import { cancelEnd, createRecurring, endNow, reactivate, recurringRepo, scheduleEnd, updateRecurring } from "@/server/recurring";
import { restore } from "@/server/repo";

export type RecurringIn = {
  name: string;
  amount: number;
  variableAmount: boolean;
  cycle: "monthly" | "yearly" | "every_n_months" | "weekly";
  dayOfMonth: number | null;
  monthOfYear: number | null;
  intervalMonths: number | null;
  anchorMonth: string | null;
  weekday: number | null;
  paymentMethodId: string | null;
  categoryId: string | null;
  memo: string | null;
  notify: boolean;
};

export async function addRecurring(input: RecurringIn) {
  return action(async (ctx) => ({ id: (await createRecurring(ctx, input)).id }));
}
export async function editRecurring(id: string, version: number, input: RecurringIn) {
  return action(async (ctx) => ({ version: (await updateRecurring(ctx, id, version, input)).version }));
}
export async function endRecurringOn(id: string, version: number, lastUseDate: string) {
  return action(async (ctx) => ({ version: (await scheduleEnd(ctx, id, version, lastUseDate)).version }));
}
export async function cancelRecurringEnd(id: string, version: number) {
  return action(async (ctx) => ({ version: (await cancelEnd(ctx, id, version)).version }));
}
export async function endRecurringNow(id: string, version: number) {
  return action(async (ctx) => ({ version: (await endNow(ctx, id, version)).version }));
}
export async function reactivateRecurring(id: string, version: number) {
  return action(async (ctx) => ({ version: (await reactivate(ctx, id, version)).version }));
}
export async function deleteRecurring(id: string) {
  return action(async (ctx) => {
    await recurringRepo.remove(ctx, id);
  });
}
export async function restoreRecurring(id: string) {
  return action((ctx) => restore(ctx, "recurring_payment", id));
}
