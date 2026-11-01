// 고정 지출 결제일 계산(src/lib/recurring.ts) 확인: node scripts/check-recurring.mts
// 06 §5.2: 말일, 윤년, 12월→1월, N개월 간격, 매주
import assert from "node:assert/strict";
import { datesBetween, nextDate, perMonth, ruleLabel, type Rule } from "../src/lib/recurring.ts";

const monthly = (d: number): Rule => ({ cycle: "monthly", dayOfMonth: d });

// 매월
assert.equal(nextDate(monthly(15), "2026-11-01"), "2026-11-15");
assert.equal(nextDate(monthly(15), "2026-11-15"), "2026-11-15", "그날 포함");
assert.equal(nextDate(monthly(15), "2026-11-16"), "2026-12-15");
assert.equal(nextDate(monthly(15), "2026-12-20"), "2027-01-15", "12월 → 1월");
assert.equal(nextDate(monthly(31), "2026-11-01"), "2026-11-30", "없는 날은 그 달 말일");
assert.equal(nextDate(monthly(31), "2027-02-01"), "2027-02-28");
assert.equal(nextDate(monthly(31), "2028-02-01"), "2028-02-29", "윤년");
assert.equal(nextDate(monthly(0), "2026-11-01"), "2026-11-30", "말일");
assert.equal(nextDate(monthly(0), "2026-12-31"), "2026-12-31");
assert.deepEqual(datesBetween(monthly(31), "2027-01-01", "2027-04-30"), ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);

// 매년
const feb29: Rule = { cycle: "yearly", monthOfYear: 2, dayOfMonth: 29 };
assert.equal(nextDate(feb29, "2026-11-01"), "2027-02-28", "평년에는 28일");
assert.equal(nextDate(feb29, "2027-03-01"), "2028-02-29", "윤년에는 29일");
assert.equal(nextDate({ cycle: "yearly", monthOfYear: 3, dayOfMonth: 2 }, "2026-03-02"), "2026-03-02");

// N개월마다(시작 달 기준)
const q: Rule = { cycle: "every_n_months", intervalMonths: 3, anchorMonth: "2026-10", dayOfMonth: 10 };
assert.equal(nextDate(q, "2026-11-01"), "2027-01-10");
assert.equal(nextDate(q, "2026-10-01"), "2026-10-10");
assert.equal(nextDate(q, "2025-01-01"), "2026-10-10", "시작 달 전에는 시작 달부터");
assert.deepEqual(datesBetween(q, "2026-10-01", "2027-07-31"), ["2026-10-10", "2027-01-10", "2027-04-10", "2027-07-10"]);

// 매주(2026-11-01은 일요일)
const mon: Rule = { cycle: "weekly", weekday: 1 };
assert.equal(nextDate(mon, "2026-11-01"), "2026-11-02");
assert.equal(nextDate(mon, "2026-11-02"), "2026-11-02");
assert.equal(datesBetween(mon, "2026-11-01", "2026-11-30").length, 5);

// 월 환산·이름
assert.equal(perMonth(13500, monthly(3)), 13500);
assert.equal(perMonth(120000, feb29), 10000);
assert.equal(perMonth(30000, q), 10000);
assert.equal(perMonth(12000, mon), 52000);
assert.deepEqual([monthly(3), monthly(0), feb29, q, mon].map(ruleLabel), ["매월 3일", "매월 말일", "매년 2월 29일", "3개월마다 10일", "매주 월요일"]);
console.log("고정 지출 결제일 계산 확인 통과");
