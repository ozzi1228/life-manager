// 일정 규칙(src/server/calendar.ts) 확인: node --env-file=.env scripts/check-calendar-db.mts (개발 DB)
// 기본 캘린더, 입력 검증, 반복 일정 이 일정만·이후·모두 고치기/지우기, 되돌리기, 캘린더 지우기, 남의 것 막기
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const { db } = await import("../src/db/index.ts");
const { calendars, eventExceptions, events, revisions } = await import("../src/db/schema.ts");
const { AppError } = await import("../src/server/errors.ts");
const { restore } = await import("../src/server/repo.ts");
const cal = await import("../src/server/calendar.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-cal-a", actor: "user" };
const B: Ctx = { userId: "check-cal-b", actor: "user" };
const users = [A.userId, B.userId];
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? (e.extra.fields?.[0]?.message ?? e.code) : String(e)));
const view = async (from = "2026-11-01", to = "2026-11-30", ctx = A) => (await cal.rangeView(ctx, from, to)).instances.map((i) => `${i.startDate} ${i.startTime ?? "종일"} ${i.title}`);

try {
  const [mine] = await cal.calendarList(A);
  assert.equal(mine.name, "내 일정");
  const base = { calendarId: mine.id, title: "운동", startDate: "2026-11-02", startTime: "19:00", endDate: "2026-11-02", endTime: "20:00" };
  assert.equal(await code(cal.createEvent(A, { ...base, title: " " })), "제목을 입력해 주세요");
  assert.equal(await code(cal.createEvent(A, { ...base, endTime: "18:00" })), "끝나는 때가 시작보다 빨라요");
  assert.equal(await code(cal.createEvent(A, { ...base, startTime: null })), "시간을 골라 주세요");
  assert.equal(await code(cal.createEvent(A, { ...base, rrule: "FREQ=SECONDLY" })), "반복을 다시 골라 주세요");
  const [bCal] = await cal.calendarList(B);
  assert.equal(await code(cal.createEvent(A, { ...base, calendarId: bCal.id })), "캘린더를 골라 주세요", "남의 캘린더 불가");

  // 종일·여러 날, 시간 지정, 반복
  await cal.createEvent(A, { ...base, title: "여행", allDay: true, startTime: "09:00", startDate: "2026-10-31", endDate: "2026-11-01" });
  const w = await cal.createEvent(A, { ...base, rrule: "FREQ=WEEKLY;COUNT=4" });
  assert.deepEqual(await view(), ["2026-10-31 종일 여행", "2026-11-02 19:00 운동", "2026-11-09 19:00 운동", "2026-11-16 19:00 운동", "2026-11-23 19:00 운동"]);
  assert.equal((await cal.rangeView(B, "2026-11-01", "2026-11-30")).instances.length, 0, "남의 일정은 안 보임");

  // 이 일정만: 11/9를 11/10 07시로
  await cal.updateEvent(A, w.id, w.version, { ...base, startDate: "2026-11-10", endDate: "2026-11-10", startTime: "07:00", endTime: "08:00", rrule: w.rrule }, "this", "2026-11-09");
  let v = await view();
  assert.ok(v.includes("2026-11-10 07:00 운동") && !v.includes("2026-11-09 19:00 운동"));
  // 이 일정만 지우기 → 되돌리기
  const del = await cal.deleteEvent(A, w.id, "this", "2026-11-16");
  assert.ok(!(await view()).some((s) => s.startsWith("2026-11-16")));
  await cal.exceptionRepo.remove(A, del.exceptionId!);
  assert.ok((await view()).includes("2026-11-16 19:00 운동"), "되돌리면 다시 보임");

  // 이후 일정: 11/16부터 21시로(COUNT 4 → 앞 2번 + 뒤 2번)
  let cur = await cal.eventRepo.get(A, w.id);
  await cal.updateEvent(A, w.id, cur.version, { ...base, startDate: "2026-11-16", endDate: "2026-11-16", startTime: "21:00", endTime: "22:00", rrule: cur.rrule }, "following", "2026-11-16");
  assert.deepEqual(
    (await view()).filter((s) => s.endsWith("운동")),
    ["2026-11-02 19:00 운동", "2026-11-10 07:00 운동", "2026-11-16 21:00 운동", "2026-11-23 21:00 운동"],
  );
  assert.deepEqual(await view("2026-11-24", "2026-12-31"), [], "COUNT는 남은 횟수로 이어짐");

  // 모든 일정: 고른 회차(11/2)를 11/3으로 옮기면 시리즈 전체가 하루 뒤로
  cur = await cal.eventRepo.get(A, w.id);
  await cal.updateEvent(A, w.id, cur.version, { ...base, title: "운동(PT)", startDate: "2026-11-03", endDate: "2026-11-03", rrule: cur.rrule }, "all", "2026-11-02");
  assert.equal((await cal.eventRepo.get(A, w.id)).startDate, "2026-11-03");
  assert.equal(await code(cal.updateEvent(A, w.id, cur.version, { ...base, rrule: cur.rrule }, "all", "2026-11-02")), "VERSION_CONFLICT");

  // 모든 일정 지우기 → 복구(예외도 함께)
  const d = await cal.deleteEvent(A, w.id, "all");
  v = await view();
  assert.ok(!v.some((s) => s.includes("운동(PT)")));
  await restore(A, "event", d.restoreId!);
  assert.ok((await view()).includes("2026-11-10 07:00 운동"), "옮긴 회차(예외)도 함께 복구");

  // 캘린더: 지우면 일정도 휴지통, 복구하면 함께, 마지막 하나는 못 지움
  const work = await cal.createCalendar(A, { name: "회사", colorHex: "#5b8def" });
  await cal.createEvent(A, { ...base, calendarId: work.id, title: "회의", startDate: "2026-11-05", endDate: "2026-11-05" });
  await cal.deleteCalendar(A, work.id);
  assert.ok(!(await view()).some((s) => s.includes("회의")));
  await restore(A, "calendar", work.id);
  assert.ok((await view()).some((s) => s.includes("회의")), "캘린더 복구 때 일정도");
  assert.equal(await code(cal.deleteCalendar(B, bCal.id)), "BUSINESS_RULE");

  // 일정 배경색: 고르기 → 보기에 나옴, null이면 캘린더 색
  const [m0] = (await cal.rangeView(A, "2026-11-05", "2026-11-05")).instances.filter((i) => i.title === "회의");
  await cal.setEventColor(A, m0.id, m0.version, "#e5737a");
  const [m1] = (await cal.rangeView(A, "2026-11-05", "2026-11-05")).instances.filter((i) => i.title === "회의");
  assert.equal(m1.colorHex, "#E5737A");
  await cal.setEventColor(A, m1.id, m1.version, null);

  // 구글 사본: 고치기·지우기·일정 넣기·캘린더 지우기는 막고, 배경색은 됨
  const g = await cal.calendarRepo.create(A, { name: "구글", colorHex: "#4285F4", externalId: "g1" }, { source: "google" });
  const ge = await cal.eventRepo.create(A, { calendarId: g.id, title: "구글 일정", allDay: true, startDate: "2026-11-06", endDate: "2026-11-06", externalId: "e1" }, { source: "google" });
  assert.equal(await code(cal.updateEvent(A, ge.id, ge.version, { ...base, calendarId: work.id, startDate: "2026-11-06", endDate: "2026-11-06" })), "BUSINESS_RULE");
  assert.equal(await code(cal.deleteEvent(A, ge.id)), "BUSINESS_RULE");
  assert.equal(await code(cal.createEvent(A, { ...base, calendarId: g.id, startDate: "2026-11-06", endDate: "2026-11-06" })), "BUSINESS_RULE");
  assert.equal(await code(cal.deleteCalendar(A, g.id)), "BUSINESS_RULE");
  await cal.setEventColor(A, ge.id, ge.version, "#5CB88A");

  // 구글 일정 → 행: 종일은 끝 날짜가 다음 날(배타적), 시각은 서울 시간, 자정에 끝나면 그 전날 23:59
  const { toRow } = await import("../src/server/google-calendar.ts");
  assert.deepEqual(toRow({ id: "a", start: { date: "2026-11-06" }, end: { date: "2026-11-08" } }), { externalId: "a", title: "(제목 없음)", location: null, memo: null, allDay: true, startDate: "2026-11-06", startTime: null, endDate: "2026-11-07", endTime: null });
  const t = toRow({ id: "b", summary: "회의", start: { dateTime: "2026-11-06T01:00:00Z" }, end: { dateTime: "2026-11-06T15:00:00Z" } })!;
  assert.deepEqual([t.startDate, t.startTime, t.endDate, t.endTime], ["2026-11-06", "10:00", "2026-11-06", "23:59"]);
  console.log("일정 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [events, eventExceptions, calendars, revisions]) await db.delete(t).where(inArray(t.userId, users));
  process.exit(process.exitCode ?? 0);
}
