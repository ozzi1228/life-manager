// 건강 기록 계산(src/lib/health.ts) 확인: node scripts/check-health.mts
import assert from "node:assert/strict";
import { dailyLast, glucoseOn, weekChange, type HealthPoint } from "../src/lib/health.ts";

const p = (date: string, time: string, value: number, context: HealthPoint["context"] = null): HealthPoint => ({ date, time, value, context });
// 하루 여러 번이면 그날 마지막 값
const daily = dailyLast([p("2026-11-02", "21:00", 52.1), p("2026-11-02", "07:00", 52.6), p("2026-10-26", "08:00", 52.7), p("2026-10-20", "08:00", 53)]);
assert.deepEqual(daily, [
  { date: "2026-10-20", value: 53 },
  { date: "2026-10-26", value: 52.7 },
  { date: "2026-11-02", value: 52.1 },
]);
assert.equal(weekChange(daily), -0.6, "7일 이상 앞선 마지막 값과 비교, 소수 1자리");
assert.equal(weekChange(daily.slice(1, 2)), null, "비교할 값이 없으면 없음");
// 오늘 혈당: 시점별 마지막 값
const g = glucoseOn([p("2026-11-02", "07:00", 101, "fasting"), p("2026-11-02", "07:30", 98, "fasting"), p("2026-11-02", "14:00", 132, "after_2h"), p("2026-11-01", "07:00", 90, "fasting")], "2026-11-02");
assert.deepEqual(g.map((x) => [x.context, x.value]), [["fasting", 98], ["after_2h", 132]]);
console.log("건강 기록 계산 확인 통과");
