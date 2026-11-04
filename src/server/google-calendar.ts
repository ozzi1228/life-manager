// 구글 캘린더 가져오기 (07 §4 G1, 19 §1): 읽기 전용. 구글 캘린더마다 우리 캘린더(source "google") 하나, 일정은 사본
// 가져오는 때: 연결 직후 + 일정 화면을 열 때 15분 지났으면 + "지금 가져오기"
// ponytail: syncToken 증분 대신 1년 전~1년 후를 singleEvents로 통째로 받아 비교(1인 사용엔 충분). 양방향(G2)은 P2
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.ts";
import { uuidv7 } from "../db/id.ts";
import { calendarLinks, calendars, events } from "../db/schema.ts";
import { addDays } from "../lib/calendar.ts";
import { seal, unseal } from "../lib/ai/secret.ts";
import { calendarRepo } from "./calendar.ts";
import { AppError } from "./errors.ts";
import type { Ctx } from "./repo.ts";

const SCOPES = ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events.readonly"];
const API = "https://www.googleapis.com/calendar/v3";
const TZ = "Asia/Seoul";

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => `${process.env.BETTER_AUTH_URL}/api/v1/google/callback`;

export const authUrl = (state: string) =>
  `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // 다시 연결할 때도 refresh token을 받게
    state,
  })}`;

async function token(body: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
  return { ok: r.ok, ...j };
}

async function get<T>(access: string, path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(`google ${r.status} ${path.split("?")[0]}`);
  return r.json() as Promise<T>;
}

type GCal = { id: string; summary: string; summaryOverride?: string; backgroundColor?: string; selected?: boolean; primary?: boolean };
type GTime = { date?: string; dateTime?: string };
type GEvent = { id: string; status?: string; summary?: string; location?: string; description?: string; start?: GTime; end?: GTime };

const getLink = async (ctx: Ctx) => (await db.select().from(calendarLinks).where(and(eq(calendarLinks.userId, ctx.userId), eq(calendarLinks.provider, "google"))))[0];

/** 화면용 연결 상태 */
export async function googleStatus(ctx: Ctx) {
  const l = await getLink(ctx);
  return { enabled: googleEnabled(), link: l ? { account: l.account, status: l.status as "ok" | "broken", syncedAt: l.syncedAt?.toISOString() ?? null } : null };
}
export type GoogleStatus = Awaited<ReturnType<typeof googleStatus>>;

/** OAuth 콜백: 코드 → refresh token 봉인 저장 → 첫 가져오기 */
export async function connectGoogle(ctx: Ctx, code: string) {
  const t = await token({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.ok || !t.refresh_token || !t.access_token) throw new AppError("BAD_REQUEST", "구글 연결을 마치지 못했어요");
  const secret = seal(t.refresh_token);
  await db
    .insert(calendarLinks)
    .values({ userId: ctx.userId, provider: "google", secret })
    .onConflictDoUpdate({ target: [calendarLinks.userId, calendarLinks.provider], set: { secret, status: "ok", updatedAt: new Date() } });
  await syncGoogle(ctx, t.access_token);
}

/** 가져오기. 토큰이 무효면 연결을 broken으로(화면에 "다시 연결") */
export async function syncGoogle(ctx: Ctx, access?: string) {
  const link = await getLink(ctx);
  if (!link) return;
  if (!access) {
    const t = await token({ refresh_token: unseal(link.secret), grant_type: "refresh_token" });
    if (!t.ok || !t.access_token) {
      if (t.error === "invalid_grant") await db.update(calendarLinks).set({ status: "broken", updatedAt: new Date() }).where(eq(calendarLinks.id, link.id));
      throw new AppError("BUSINESS_RULE", "구글 캘린더 연결이 끊겼어요. 다시 연결해 주세요");
    }
    access = t.access_token;
  }

  const { items: remote = [] } = await get<{ items?: GCal[] }>(access, "/users/me/calendarList?maxResults=250");
  const local = await calendarRepo.list(ctx, { where: eq(calendars.source, "google"), limit: 1000 });
  // 구글에서 없어진 캘린더는 사본째 지움
  const gone = local.filter((c) => !remote.some((r) => r.id === c.externalId)).map((c) => c.id);
  if (gone.length) await dropCalendars(ctx, gone);
  const cals = await Promise.all(
    remote.map(
      async (r, i) =>
        local.find((c) => c.externalId === r.id) ??
        calendarRepo.create(ctx, { name: (r.summaryOverride ?? r.summary).slice(0, 40), colorHex: (r.backgroundColor ?? "#5B8DEF").toUpperCase(), isVisible: !!r.selected, sort: 100 + i, externalId: r.id }, { source: "google" }),
    ),
  );

  const now = new Date();
  const timeMin = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const timeMax = new Date(now.getTime() + 365 * 86_400_000).toISOString();
  for (const cal of cals) {
    const list: GEvent[] = [];
    let page = "";
    do {
      const q = new URLSearchParams({ singleEvents: "true", timeMin, timeMax, maxResults: "2500", ...(page && { pageToken: page }) });
      const r = await get<{ items?: GEvent[]; nextPageToken?: string }>(access, `/calendars/${encodeURIComponent(cal.externalId!)}/events?${q}`);
      list.push(...(r.items ?? []));
      page = r.nextPageToken ?? "";
    } while (page);
    await saveEvents(ctx, cal.id, list.filter((e) => e.status !== "cancelled").map(toRow).filter((e) => e !== null));
  }
  await db
    .update(calendarLinks)
    .set({ account: remote.find((r) => r.primary)?.id ?? link.account, status: "ok", syncedAt: new Date(), updatedAt: new Date() })
    .where(eq(calendarLinks.id, link.id));
}

/** 구글 시각(오프셋 포함) → 이 앱 시간대의 날짜·HH:MM */
const wall = (iso: string) => {
  const s = new Date(iso).toLocaleString("sv-SE", { timeZone: TZ, hourCycle: "h23" }); // "2026-11-03 10:00:00"
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
};
export function toRow(e: GEvent) {
  const base = { externalId: e.id, title: (e.summary?.trim() || "(제목 없음)").slice(0, 100), location: e.location?.slice(0, 200) || null, memo: e.description?.replace(/<[^>]+>/g, "").slice(0, 2000) || null };
  if (e.start?.date && e.end?.date) return { ...base, allDay: true, startDate: e.start.date, startTime: null, endDate: addDays(e.end.date, -1) < e.start.date ? e.start.date : addDays(e.end.date, -1), endTime: null };
  if (!e.start?.dateTime || !e.end?.dateTime) return null;
  const s = wall(e.start.dateTime);
  let t = wall(e.end.dateTime);
  if (t.time === "00:00" && t.date > s.date) t = { date: addDays(t.date, -1), time: "23:59" }; // 자정에 끝나면 그 전날 끝까지로
  return { ...base, allDay: false, startDate: s.date, startTime: s.time, endDate: t.date, endTime: t.time };
}
type Row = NonNullable<ReturnType<typeof toRow>>;

/** 구글 id로 맞춰 바뀐 것만 고침(id·내가 고른 배경색 유지), 없어진 건 지움. 사본이라 휴지통·변경 이력을 거치지 않음 */
async function saveEvents(ctx: Ctx, calendarId: string, rows: Row[]) {
  const cur = await db.select().from(events).where(and(eq(events.userId, ctx.userId), eq(events.calendarId, calendarId)));
  const byExt = new Map(cur.map((e) => [e.externalId, e]));
  const keys = ["title", "allDay", "startDate", "startTime", "endDate", "endTime", "location", "memo"] as const;
  await db.transaction(async (tx) => {
    const seen = new Set<string>();
    const fresh = [];
    for (const r of rows) {
      const old = byExt.get(r.externalId);
      if (!old) {
        fresh.push({ ...r, id: uuidv7(), userId: ctx.userId, source: "google", calendarId });
        continue;
      }
      seen.add(old.id);
      if (keys.some((k) => old[k] !== r[k])) await tx.update(events).set({ ...r, version: old.version + 1, updatedAt: new Date() }).where(eq(events.id, old.id));
    }
    for (let i = 0; i < fresh.length; i += 500) await tx.insert(events).values(fresh.slice(i, i + 500));
    const drop = cur.filter((e) => !seen.has(e.id)).map((e) => e.id);
    if (drop.length) await tx.delete(events).where(inArray(events.id, drop));
  });
}

async function dropCalendars(ctx: Ctx, ids: string[]) {
  await db.transaction(async (tx) => {
    await tx.delete(events).where(and(eq(events.userId, ctx.userId), inArray(events.calendarId, ids)));
    await tx.delete(calendars).where(and(eq(calendars.userId, ctx.userId), inArray(calendars.id, ids)));
  });
}

/** 연결 해제: 구글 권한 돌려주고(실패해도 진행) 가져온 사본 지움. 구글 원본은 그대로 */
export async function disconnectGoogle(ctx: Ctx) {
  const link = await getLink(ctx);
  if (!link) return;
  await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: unseal(link.secret) }) }).catch(() => {});
  const mine = await db.select({ id: calendars.id }).from(calendars).where(and(eq(calendars.userId, ctx.userId), eq(calendars.source, "google")));
  if (mine.length) await dropCalendars(ctx, mine.map((c) => c.id));
  await db.delete(calendarLinks).where(eq(calendarLinks.id, link.id));
}
