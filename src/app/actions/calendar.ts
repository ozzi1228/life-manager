"use server";

// 일정·내 캘린더 (SCR-CAL-01~03). 규칙은 src/server/calendar.ts
import { action } from "@/server/api";
import {
  createCalendar,
  createEvent,
  deleteCalendar,
  deleteEvent,
  reorderCalendars,
  exceptionRepo,
  saveNote,
  setCalendarVisible,
  setEventColor,
  updateCalendar,
  updateEvent,
  type CalendarInput,
  type EventInput,
  type NoteScope,
  type Scope,
} from "@/server/calendar";
import { disconnectGoogle, saveGoogleKeys, syncGoogle, testGoogleKeys } from "@/server/google-calendar";
import { once } from "@/server/idempotency";
import { restore } from "@/server/repo";

export async function addEvent(key: string, input: EventInput) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `event:${key}`, JSON.stringify(input), async () => ({ status: 201, body: { id: (await createEvent(ctx, input)).id } }));
    return body as { id: string };
  });
}
export async function editEvent(id: string, version: number, input: EventInput, scope: Scope, occurrenceDate: string) {
  return action(async (ctx) => {
    await updateEvent(ctx, id, version, input, scope, occurrenceDate);
  });
}
export async function removeEvent(id: string, scope: Scope, occurrenceDate: string) {
  return action((ctx) => deleteEvent(ctx, id, scope, occurrenceDate));
}
/** 지우기 되돌리기: 휴지통 복구 또는 "이 일정만 지움" 예외 지우기 */
export async function undoRemoveEvent(undo: { restoreId?: string; exceptionId?: string }) {
  return action(async (ctx) => {
    if (undo.restoreId) await restore(ctx, "event", undo.restoreId);
    if (undo.exceptionId) await exceptionRepo.remove(ctx, undo.exceptionId);
  });
}

/** 일정 배경색(null = 캘린더 색) */
export async function colorEvent(id: string, version: number, colorHex: string | null) {
  return action(async (ctx) => {
    await setEventColor(ctx, id, version, colorHex);
  });
}

/** 구글 캘린더 지금 가져오기 · 연동 해제 */
export async function syncGoogleNow() {
  return action((ctx) => syncGoogle(ctx));
}
/** 구글 앱 키: 확인만 / 확인 후 저장 */
export async function checkGoogleKeys(id: string, secret: string) {
  return action(async () => testGoogleKeys(id, secret));
}
export async function setGoogleKeys(id: string, secret: string) {
  return action((ctx) => saveGoogleKeys(ctx, id, secret));
}
export async function unlinkGoogle() {
  return action((ctx) => disconnectGoogle(ctx));
}

export async function addCalendar(input: CalendarInput) {
  return action(async (ctx) => ({ id: (await createCalendar(ctx, input)).id }));
}
export async function editCalendar(id: string, version: number, input: CalendarInput) {
  return action(async (ctx) => {
    await updateCalendar(ctx, id, version, input);
  });
}
export async function showCalendar(id: string, version: number, visible: boolean) {
  return action(async (ctx) => {
    await setCalendarVisible(ctx, id, version, visible);
  });
}
export async function removeCalendar(id: string) {
  return action((ctx) => deleteCalendar(ctx, id));
}
export async function restoreCalendar(id: string) {
  return action((ctx) => restore(ctx, "calendar", id));
}

/** 기간 메모 저장(연·월·주·일) */
export async function saveCalendarNote(scope: NoteScope, key: string, body: string, version: number | null) {
  return action((ctx) => saveNote(ctx, scope, key, body, version));
}
/** 내 캘린더 순서(맨 위 = 기본 캘린더) */
export async function reorderCalendar(ids: string[]) {
  return action((ctx) => reorderCalendars(ctx, ids));
}
