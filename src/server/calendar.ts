// 일정 서비스 (docs/planning/07 §2, 15 §7). 날짜·반복 계산은 src/lib/calendar.ts
// 반복 일정 고치기·지우기 범위(07 §2.3): 이 일정만(예외) / 이후 일정(원래 반복을 전날로 끝내고 새 반복) / 모든 일정(원본)
// ponytail: 알림(웹 푸시)·겹쳐 보기(결제일 등)·외부 캘린더는 P1(M-21·C-08)
import { and, asc, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { uuidv7 } from "../db/id.ts";
import { calendars, eventExceptions, events } from "../db/schema.ts";
import { addDays, countBefore, dayOfWeek, daysBetween, expand, parseRule, ruleString, sortKey, type Exception } from "../lib/calendar.ts";
import { GOAL_PALETTE } from "../lib/palette.ts";
import { AppError } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const calendarRepo = defineRepo(calendars, "calendar");
export const eventRepo = defineRepo(events, "event");
export const exceptionRepo = defineRepo(eventExceptions, "event_exception");

// ── 내 캘린더 ──

export async function calendarList(ctx: Ctx) {
  const list = await calendarRepo.list(ctx, { orderBy: [asc(calendars.sort), asc(calendars.createdAt)] });
  if (list.length) return list;
  const [any] = await db.select({ id: calendars.id }).from(calendars).where(eq(calendars.userId, ctx.userId)).limit(1);
  if (any) return list; // 사용자가 다 지운 경우는 다시 만들지 않음 — 일정 추가 때 만듦
  await calendarRepo.create(ctx, { name: "내 일정", colorHex: GOAL_PALETTE[7].hex, sort: 0 }, { source: "default" });
  return calendarRepo.list(ctx, { orderBy: [asc(calendars.sort), asc(calendars.createdAt)] });
}

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "색을 다시 골라 주세요").transform((s) => s.toUpperCase());
export const calendarInput = z.object({ name: z.string().trim().min(1, "이름을 입력해 주세요").max(20, "이름은 20자까지 쓸 수 있어요"), colorHex: hex });
export type CalendarInput = z.input<typeof calendarInput>;

export async function createCalendar(ctx: Ctx, input: unknown) {
  const v = parse(calendarInput, input);
  const list = await calendarRepo.list(ctx);
  return calendarRepo.create(ctx, { ...v, sort: list.length });
}
export const updateCalendar = (ctx: Ctx, id: string, version: number, input: unknown) => calendarRepo.update(ctx, id, version, parse(calendarInput, input));
export const setCalendarVisible = (ctx: Ctx, id: string, version: number, visible: boolean) => calendarRepo.update(ctx, id, version, { isVisible: visible });

/** 캘린더 지우기: 그 캘린더의 일정도 한 묶음으로 휴지통에(함께 복구). 마지막 하나는 못 지움 */
export async function deleteCalendar(ctx: Ctx, id: string) {
  const list = await calendarRepo.list(ctx);
  if (!list.some((c) => c.id === id)) throw new AppError("NOT_FOUND", "찾을 수 없어요");
  if (list.length === 1) throw new AppError("BUSINESS_RULE", "캘린더가 하나는 있어야 해요");
  const evs = await eventRepo.list(ctx, { where: eq(events.calendarId, id), limit: 1000 });
  const batchId = uuidv7();
  await db.transaction(async (tx) => {
    for (const e of evs) await eventRepo.remove(ctx, e.id, { tx, batchId });
    await calendarRepo.remove(ctx, id, { tx, batchId });
  });
}

// ── 일정 ──

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 골라 주세요");
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간을 다시 골라 주세요");
export const eventInput = z
  .object({
    calendarId: z.uuid({ error: "캘린더를 골라 주세요" }),
    title: z.string().trim().min(1, "제목을 입력해 주세요").max(100, "제목은 100자까지 쓸 수 있어요"),
    allDay: z.boolean().default(false),
    startDate: ymd,
    startTime: hm.nullable().default(null),
    endDate: ymd,
    endTime: hm.nullable().default(null),
    rrule: z.string().max(200).nullable().default(null),
    location: z.string().trim().max(200).nullable().default(null),
    memo: z.string().max(2000).nullable().default(null),
  })
  .refine((v) => v.allDay || (v.startTime && v.endTime), { path: ["startTime"], message: "시간을 골라 주세요" })
  .refine((v) => (v.allDay ? v.endDate >= v.startDate : `${v.endDate} ${v.endTime}` >= `${v.startDate} ${v.startTime}`), { path: ["endDate"], message: "끝나는 때가 시작보다 빨라요" })
  .refine((v) => !v.rrule || parseRule(v.rrule), { path: ["rrule"], message: "반복을 다시 골라 주세요" })
  .refine((v) => !v.rrule || !parseRule(v.rrule)?.until || parseRule(v.rrule)!.until! >= v.startDate, { path: ["rrule"], message: "반복 끝나는 날이 시작보다 빨라요" })
  .transform((v) => ({
    ...v,
    startTime: v.allDay ? null : v.startTime,
    endTime: v.allDay ? null : v.endTime,
    rrule: v.rrule ? ruleString(parseRule(v.rrule)!) : null,
    location: v.location || null,
    memo: v.memo?.trim() ? v.memo : null,
  }));
export type EventInput = z.input<typeof eventInput>;
export type Scope = "this" | "following" | "all";

async function checkCalendar(ctx: Ctx, id: string) {
  if (!(await calendarRepo.get(ctx, id).catch(() => null))) throw new AppError("VALIDATION_FAILED", "캘린더를 골라 주세요", { fields: [{ path: "calendarId", rule: "exists", message: "캘린더를 골라 주세요" }] });
}

export async function createEvent(ctx: Ctx, input: unknown) {
  const v = parse(eventInput, input);
  await checkCalendar(ctx, v.calendarId);
  return eventRepo.create(ctx, v);
}

const overrideOf = (v: z.infer<typeof eventInput>) => {
  const { rrule: _rrule, ...rest } = v;
  void _rrule;
  return rest;
};

/** 고치기. 반복 일정이면 scope와 고른 회차(occurrenceDate)로 범위를 정함 */
export async function updateEvent(ctx: Ctx, id: string, version: number, input: unknown, scope: Scope = "all", occurrenceDate?: string) {
  const v = parse(eventInput, input);
  await checkCalendar(ctx, v.calendarId);
  const e = await eventRepo.get(ctx, id);
  const rule = parseRule(e.rrule);
  const occ = occurrenceDate ?? e.startDate;
  if (!rule || scope === "all" || (scope === "following" && occ <= e.startDate)) {
    if (!rule) return eventRepo.update(ctx, id, version, v);
    // 모든 일정: 고른 회차에서 옮긴 만큼 시리즈 시작·끝나는 날·한 요일 반복·예외 회차 날짜도 함께 옮김
    const shift = daysBetween(occ, v.startDate);
    const startDate = addDays(e.startDate, shift);
    const next = parseRule(v.rrule);
    const rrule = next && shift ? ruleString({ ...next, until: next.until && addDays(next.until, shift), byDay: next.byDay.length === 1 ? [dayOfWeek(v.startDate)] : next.byDay }) : v.rrule;
    return db.transaction(async (tx) => {
      if (shift) for (const x of await exceptionRepo.list(ctx, { where: eq(eventExceptions.eventId, id), limit: 1000 })) await exceptionRepo.update(ctx, x.id, x.version, { originalDate: addDays(x.originalDate, shift) }, { tx });
      return eventRepo.update(ctx, id, version, { ...v, rrule, startDate, endDate: addDays(startDate, daysBetween(v.startDate, v.endDate)) }, { tx });
    });
  }
  if (scope === "this") {
    const [cur] = await exceptionRepo.list(ctx, { where: and(eq(eventExceptions.eventId, id), eq(eventExceptions.originalDate, occ)), limit: 1 });
    const values = { kind: "modified" as const, override: overrideOf(v) };
    return cur ? exceptionRepo.update(ctx, cur.id, cur.version, values) : exceptionRepo.create(ctx, { ...values, eventId: id, originalDate: occ });
  }
  // 이후 일정: 원래 반복은 전날까지, 이 회차부터 새 반복(COUNT는 남은 횟수로)
  return db.transaction(async (tx) => {
    await eventRepo.update(ctx, id, version, { rrule: ruleString({ ...rule, until: addDays(occ, -1), count: null }) }, { tx });
    const next = parseRule(v.rrule);
    const rrule = next && v.rrule === e.rrule && rule.count ? ruleString({ ...next, count: Math.max(1, rule.count - countBefore(e.startDate, rule, occ)) }) : v.rrule;
    return eventRepo.create(ctx, { ...v, rrule }, { tx });
  });
}

/** 지우기. 반환값은 되돌리기용: { restoreId } = 휴지통 복구, { exceptionId } = 그 예외 지우기, 없으면 되돌리기 없음 */
export async function deleteEvent(ctx: Ctx, id: string, scope: Scope = "all", occurrenceDate?: string): Promise<{ restoreId?: string; exceptionId?: string }> {
  const e = await eventRepo.get(ctx, id);
  const rule = parseRule(e.rrule);
  const occ = occurrenceDate ?? e.startDate;
  if (!rule || scope === "all" || (scope === "following" && occ <= e.startDate)) {
    const exs = await exceptionRepo.list(ctx, { where: eq(eventExceptions.eventId, id), limit: 1000 });
    const batchId = uuidv7();
    await db.transaction(async (tx) => {
      for (const x of exs) await exceptionRepo.remove(ctx, x.id, { tx, batchId });
      await eventRepo.remove(ctx, id, { tx, batchId });
    });
    return { restoreId: id };
  }
  if (scope === "this") {
    const [cur] = await exceptionRepo.list(ctx, { where: and(eq(eventExceptions.eventId, id), eq(eventExceptions.originalDate, occ)), limit: 1 });
    if (cur) await exceptionRepo.remove(ctx, cur.id);
    const row = await exceptionRepo.create(ctx, { eventId: id, originalDate: occ, kind: "cancelled", override: null });
    return { exceptionId: row.id };
  }
  await eventRepo.update(ctx, id, e.version, { rrule: ruleString({ ...rule, until: addDays(occ, -1), count: null }) });
  return {};
}

/** 보기 범위 [from, to]의 일정 회차(시작 순) */
export async function rangeView(ctx: Ctx, from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || daysBetween(from, to) > 62) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
  const [cals, evs] = await Promise.all([
    calendarList(ctx),
    eventRepo.list(ctx, { where: and(lte(events.startDate, to), or(gte(events.endDate, from), isNotNull(events.rrule))), orderBy: [asc(events.startDate)], limit: 1000 }),
  ]);
  const exs = evs.some((e) => e.rrule)
    ? await exceptionRepo.list(
        ctx,
        {
          where: inArray(
            eventExceptions.eventId,
            evs.filter((e) => e.rrule).map((e) => e.id),
          ),
          limit: 1000,
        },
      )
    : [];
  const instances = evs
    .flatMap((e) =>
      expand(
        e,
        exs.filter((x) => x.eventId === e.id) as Exception[],
        from,
        to,
      ).map((i) => ({
        id: e.id,
        version: e.version,
        occurrenceDate: i.occurrenceDate,
        modified: i.modified,
        calendarId: i.calendarId,
        title: i.title,
        allDay: i.allDay,
        startDate: i.startDate,
        startTime: i.startTime,
        endDate: i.endDate,
        endTime: i.endTime,
        location: i.location,
        memo: i.memo,
        rrule: e.rrule,
        seriesStart: e.startDate,
      })),
    )
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return { calendars: cals.map((c) => ({ id: c.id, version: c.version, name: c.name, colorHex: c.colorHex, isVisible: c.isVisible })), instances };
}
export type Instance = Awaited<ReturnType<typeof rangeView>>["instances"][number];
export type CalendarItem = Awaited<ReturnType<typeof rangeView>>["calendars"][number];
