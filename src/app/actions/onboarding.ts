"use server";

// 온보딩 마침(SCR-AUTH-04): 고른 영역 저장, 다 봤다고 표시 → 앱 화면으로
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { action } from "@/server/api";

const AREAS = ["goals", "money", "calendar", "records", "health"];

export async function completeOnboarding(areas: string[]) {
  return action(async (ctx) => {
    const picked = areas.filter((a) => AREAS.includes(a));
    const now = new Date();
    await db
      .insert(userSettings)
      .values({ userId: ctx.userId, areas: picked, onboardedAt: now })
      .onConflictDoUpdate({ target: userSettings.userId, set: { areas: picked, onboardedAt: now, updatedAt: now } });
  });
}
