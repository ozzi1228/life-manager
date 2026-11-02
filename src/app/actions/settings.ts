"use server";

// 사용자 설정 변경 (같은 서비스 규칙: 세션 사용자 범위, 공통 오류 형식)
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { action } from "@/server/api";
import { AppError } from "@/server/errors";
import { opsStatus } from "@/server/ops";
import { notifyPrefs, removePush, savePush, setNotifyPref, type NotifyKind } from "@/server/push";

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

/** 메뉴·탭 순서 저장(끌어 바꾼 묶음만, 기기를 바꿔도 같은 순서) */
export async function saveNavOrder(key: string, hrefs: string[]) {
  return action(async (ctx) => {
    if (!/^(main|\/[a-z/-]{1,40})$/.test(key) || hrefs.length > 20 || hrefs.some((h) => !/^\/[\w/-]{0,60}$/.test(h))) throw new AppError("VALIDATION_FAILED", "순서를 저장할 수 없어요");
    await db
      .insert(userSettings)
      .values({ userId: ctx.userId, navOrder: { [key]: hrefs } })
      .onConflictDoUpdate({ target: userSettings.userId, set: { navOrder: sql`${userSettings.navOrder} || ${JSON.stringify({ [key]: hrefs })}::jsonb`, updatedAt: new Date() } });
  });
}

// ── 알림(04 §8.4) ──
export async function subscribePush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, device: string | null) {
  return action(async (ctx) => {
    await savePush(ctx, sub, device?.slice(0, 40) ?? null);
  });
}
export async function unsubscribePush(endpoint: string) {
  return action(async (ctx) => {
    await removePush(ctx, endpoint);
  });
}
export async function notifySettings() {
  return action((ctx) => notifyPrefs(ctx.userId));
}
export async function setNotify(kind: NotifyKind, on: boolean) {
  return action((ctx) => setNotifyPref(ctx, kind, on));
}

/** 운영 상태(주인만, 아니면 null) */
export async function loadOpsStatus() {
  return action((ctx) => opsStatus(ctx));
}
