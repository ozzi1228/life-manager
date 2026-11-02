// 일정 반복 계산(src/lib/calendar.ts) 확인: node scripts/check-calendar.mts
// 07 §2.3: 매일·매주(요일 여러 개·간격)·매월(31일 건너뜀)·매년(2/29), UNTIL·COUNT, 예외(취소·옮김), 여러 날 일정
import assert from "node:assert/strict";
import { countBefore, expand, parseRule, ruleLabel, ruleString, seriesDates } from "../src/lib/calendar.ts";

const r = (s: string) => parseRule(s)!;
assert.deepEqual(r("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO;UNTIL=20261231T000000Z"), { freq: "WEEKLY", interval: 2, byDay: [1, 3], until: "2026-12-31", count: null });
assert.equal(ruleString(r("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5")), "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5");
assert.equal(parseRule("FREQ=HOURLY"), null);

// 매일 3일 간격, COUNT
assert.deepEqual(seriesDates("2026-11-01", r("FREQ=DAILY;INTERVAL=3;COUNT=3"), "2026-12-31"), ["2026-11-01", "2026-11-04", "2026-11-07"]);
// 매주 월·수(시작이 수요일 → 그 주 월요일은 건너뜀), 2주마다
assert.deepEqual(seriesDates("2026-11-04", r("FREQ=WEEKLY;BYDAY=MO,WE"), "2026-11-16"), ["2026-11-04", "2026-11-09", "2026-11-11", "2026-11-16"]);
assert.deepEqual(seriesDates("2026-11-02", r("FREQ=WEEKLY;INTERVAL=2"), "2026-11-30"), ["2026-11-02", "2026-11-16", "2026-11-30"]);
// 매월 31일: 없는 달 건너뜀 / 매년 2월 29일: 윤년만
assert.deepEqual(seriesDates("2026-01-31", r("FREQ=MONTHLY"), "2026-05-31"), ["2026-01-31", "2026-03-31", "2026-05-31"]);
assert.deepEqual(seriesDates("2024-02-29", r("FREQ=YEARLY"), "2032-12-31"), ["2024-02-29", "2028-02-29", "2032-02-29"]);
// UNTIL 포함, 보기 범위가 짧아도 COUNT는 처음부터 셈
assert.deepEqual(seriesDates("2026-11-01", r("FREQ=DAILY;UNTIL=20261103"), "2026-12-31"), ["2026-11-01", "2026-11-02", "2026-11-03"]);
assert.equal(countBefore("2026-11-01", r("FREQ=DAILY;COUNT=10"), "2026-11-05"), 4);

// 펼치기: 범위·취소·옮긴 회차·여러 날
const ev = { allDay: false, startDate: "2026-11-02", startTime: "19:00", endDate: "2026-11-02", endTime: "20:00", rrule: "FREQ=WEEKLY", title: "운동" };
const inst = expand(
  ev,
  [
    { originalDate: "2026-11-09", kind: "cancelled", override: null },
    { originalDate: "2026-11-16", kind: "modified", override: { startDate: "2026-11-17", endDate: "2026-11-17", startTime: "07:00", endTime: "08:00" } },
    { originalDate: "2026-12-07", kind: "modified", override: { startDate: "2026-11-30", endDate: "2026-11-30" } }, // 범위 밖에서 안으로 옮김
  ],
  "2026-11-01",
  "2026-11-30",
);
assert.deepEqual(
  inst.map((i) => [i.occurrenceDate, i.startDate, i.startTime]),
  [
    ["2026-11-02", "2026-11-02", "19:00"],
    ["2026-11-16", "2026-11-17", "07:00"],
    ["2026-11-23", "2026-11-23", "19:00"],
    ["2026-11-30", "2026-11-30", "19:00"],
    ["2026-12-07", "2026-11-30", "19:00"],
  ],
);
const trip = expand({ allDay: true, startDate: "2026-10-30", startTime: null, endDate: "2026-11-02", endTime: null, rrule: null }, [], "2026-11-01", "2026-11-30");
assert.equal(trip.length, 1, "앞 달에서 시작한 여러 날 일정도 보임");

assert.equal(ruleLabel("FREQ=WEEKLY;BYDAY=MO,WE", "2026-11-02"), "매주 월·수");
assert.equal(ruleLabel("FREQ=WEEKLY;INTERVAL=2", "2026-11-03"), "2주마다 화");
assert.equal(ruleLabel("FREQ=MONTHLY;COUNT=6", "2026-11-15"), "매월 15일 · 6회");
assert.equal(ruleLabel("FREQ=YEARLY;UNTIL=20301102", "2026-11-02"), "매년 11월 2일 · 2030년 11월 2일까지");
console.log("일정 반복 계산 확인 통과");
