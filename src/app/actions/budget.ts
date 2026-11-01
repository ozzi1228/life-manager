"use server";

// 월별 예산 저장·복사·큰 지출 표시 (SCR-FIN-04·05). 규칙은 src/server/budget.ts
import { action } from "@/server/api";
import { copyPrevious, saveBudget, setPlannedDone, type BudgetInput } from "@/server/budget";

export async function saveMonthBudget(month: string, version: number | null, input: BudgetInput) {
  return action(async (ctx) => {
    const b = await saveBudget(ctx, month, version, input);
    return { version: b.version };
  });
}

export async function copyLastMonthBudget(month: string) {
  return action(async (ctx) => {
    await copyPrevious(ctx, month);
    return null;
  });
}

export async function markPlannedDone(id: string, version: number, done: boolean) {
  return action(async (ctx) => {
    await setPlannedDone(ctx, id, version, done);
    return null;
  });
}
