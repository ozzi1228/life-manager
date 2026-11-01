"use server";

// 사용자 설정 변경 (같은 서비스 규칙: 세션 사용자 범위, 공통 오류 형식)
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { action } from "@/server/api";

/** 최초 안내를 봤다고 기록(기기를 바꿔도 다시 안 뜸, 03 §7.3) */
export async function markHintSeen(id: string) {
  return action(async (ctx) => {
    const hint = id.slice(0, 64);
    await db
      .insert(userSettings)
      .values({ userId: ctx.userId, seenHints: [hint] })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { seenHints: sql`case when ${userSettings.seenHints} ? ${hint} then ${userSettings.seenHints} else ${userSettings.seenHints} || ${JSON.stringify([hint])}::jsonb end`, updatedAt: new Date() },
      });
  });
}
