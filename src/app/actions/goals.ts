"use server";

// 목표·습관 트래커 화면 동작 (SCR-GOAL-02~07). 규칙은 src/server/goals.ts
import { action } from "@/server/api";
import {
  addItem,
  createGoal,
  createPeriodGoal,
  goalRepo,
  itemRepo,
  removeFromMonth,
  reorderMonth,
  setCell,
  setGoalStatus,
  startMonthWith,
  suggestColor,
  updateGoal,
  updateItem,
} from "@/server/goals";
import { restore } from "@/server/repo";

export async function saveCell(input: { itemId: string; date: string; done: boolean; memo: string | null }) {
  return action((ctx) => setCell(ctx, input));
}

export async function nextColor(month: string) {
  return action((ctx) => suggestColor(ctx, month));
}

export async function addTrackerItem(month: string, input: { name: string; colorHex: string }) {
  return action(async (ctx) => {
    const i = await addItem(ctx, month, input);
    return { id: i.id };
  });
}

export async function editTrackerItem(id: string, version: number, input: { name: string; colorHex: string }) {
  return action(async (ctx) => {
    await updateItem(ctx, id, version, input);
  });
}

export async function reorderTrackerItems(month: string, itemIds: string[]) {
  return action((ctx) => reorderMonth(ctx, month, itemIds));
}

export async function hideTrackerItem(id: string, month: string) {
  return action((ctx) => removeFromMonth(ctx, id, month));
}

export async function deleteTrackerItem(id: string) {
  return action(async (ctx) => {
    await itemRepo.remove(ctx, id);
  });
}

export async function restoreTrackerItem(id: string) {
  return action((ctx) => restore(ctx, "tracker_item", id));
}

export async function startTrackerMonth(month: string, itemIds: string[]) {
  return action((ctx) => startMonthWith(ctx, month, itemIds.slice(0, 50)));
}

type GoalIn = { title: string; horizon: "short" | "mid" | "long"; startYear: number | null; endYear: number | null; categoryId: string | null; memo: string | null; periodScope?: "month" | "week" | "day" | null; periodKey?: string | null };

export async function addGoal(input: GoalIn) {
  return action(async (ctx) => ({ id: (await createGoal(ctx, input)).id }));
}

/** 기간 목표 빠른 추가(목표 월별·주간·일간, 일정 화면) */
export async function addPeriodGoal(scope: "year" | "month" | "week" | "day", key: string, title: string) {
  return action(async (ctx) => ({ id: (await createPeriodGoal(ctx, scope, key, title)).id }));
}

export async function editGoal(id: string, version: number, input: GoalIn) {
  return action(async (ctx) => {
    await updateGoal(ctx, id, version, input);
  });
}

export async function changeGoalStatus(id: string, version: number, status: "active" | "done" | "paused" | "dropped") {
  return action(async (ctx) => {
    const g = await setGoalStatus(ctx, id, version, status);
    return { version: g.version };
  });
}

export async function deleteGoal(id: string) {
  return action(async (ctx) => {
    await goalRepo.remove(ctx, id);
  });
}

export async function restoreGoal(id: string) {
  return action((ctx) => restore(ctx, "goal", id));
}
