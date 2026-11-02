// 웹 푸시 (07 §2.4, 04 §8.4): 기기마다 구독 저장, 서버가 보냄. 구독이 사라진 기기(404·410)는 지움
// 알림 문구에는 건강 등 민감한 내용을 넣지 않음(10 §7)
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { db } from "../db/index.ts";
import { pushSubscriptions, userSettings } from "../db/schema.ts";
import type { Ctx } from "./repo.ts";

export type NotifyKind = "payment" | "budget" | "restraint";
export type PushMessage = { title: string; body: string; url: string };

let ready: boolean | null = null;
function vapid() {
  if (ready === null) {
    const { VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
    ready = !!(VAPID_SUBJECT && NEXT_PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
    if (ready) webpush.setVapidDetails(VAPID_SUBJECT!, NEXT_PUBLIC_VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  }
  return ready;
}

export async function savePush(ctx: Ctx, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, device: string | null) {
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("bad subscription");
  await db
    .insert(pushSubscriptions)
    .values({ userId: ctx.userId, endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, device })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: ctx.userId, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, device } });
}
export const removePush = (ctx: Ctx, endpoint: string) => db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, ctx.userId), eq(pushSubscriptions.endpoint, endpoint)));

export async function notifyPrefs(userId: string) {
  const [row] = await db.select({ notify: userSettings.notify }).from(userSettings).where(eq(userSettings.userId, userId));
  const n = row?.notify ?? {};
  return { payment: n.payment !== false, budget: n.budget !== false, restraint: n.restraint !== false };
}
export async function setNotifyPref(ctx: Ctx, kind: NotifyKind, on: boolean) {
  const cur = await notifyPrefs(ctx.userId);
  const notify = Object.fromEntries(Object.entries({ ...cur, [kind]: on }).filter(([, v]) => !v));
  await db.insert(userSettings).values({ userId: ctx.userId, notify }).onConflictDoUpdate({ target: userSettings.userId, set: { notify, updatedAt: new Date() } });
}

/** 알림 받는 기기가 있는 사용자(알림 작업이 이 사람들만 봄 — 기기가 없으면 "보냄" 기록도 남기지 않게) */
export const pushUsers = async () => new Set((await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions)).map((r) => r.userId));

/** 이 사용자의 모든 기기로. 꺼 둔 종류면 보내지 않음. 보낸 기기 수 */
export async function sendPush(userId: string, kind: NotifyKind, msg: PushMessage) {
  if (!vapid() || !(await notifyPrefs(userId))[kind]) return 0;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else console.error("push failed", code ?? e);
    }
  }
  return sent;
}
