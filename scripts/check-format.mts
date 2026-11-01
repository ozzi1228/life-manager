// 표시 형식(src/lib/format.ts) 확인: node scripts/check-format.mts
import assert from "node:assert/strict";
import { addMonths, dateLabel, dayLabel, money, moneyShort, monthLabel, parseMoney, timeLabel } from "../src/lib/format.ts";

const today = new Date(2026, 10, 1); // 2026-11-01 (일)
assert.equal(money(12000), "12,000원");
assert.equal(money(50000, { sign: true }), "+50,000원");
assert.equal(money(-3000), "-3,000원");
assert.equal(money(0, { sign: true }), "0원");
assert.equal(moneyShort(9800), "9,800원");
assert.equal(moneyShort(12000), "1.2만원");
assert.equal(moneyShort(2_300_000), "230만원");
assert.equal(moneyShort(150_000_000), "1.5억원");
assert.equal(parseMoney("12,000원"), 12000);
assert.equal(parseMoney(" 원 "), null);
assert.equal(dateLabel("2026-11-01", today), "11월 1일 (일)");
assert.equal(dateLabel("2025-12-31", today), "2025년 12월 31일");
assert.equal(dayLabel("2026-11-01", today), "오늘");
assert.equal(dayLabel("2026-10-31", today), "어제");
assert.equal(dayLabel("2026-10-25", today), "7일 전");
assert.equal(dayLabel("2026-10-24", today), "10월 24일 (토)");
assert.equal(timeLabel(new Date(2026, 10, 1, 14, 5)), "오후 2:05");
assert.equal(timeLabel(new Date(2026, 10, 1, 0, 0)), "오전 12:00");
assert.equal(addMonths("2026-01", -1), "2025-12");
assert.equal(addMonths("2026-11", 2), "2027-01");
assert.equal(monthLabel("2026-11", today), "11월");
assert.equal(monthLabel("2027-01", today), "2027년 1월");
console.log("표시 형식 확인 통과");

// 목표 팔레트: 규칙(명암비 높은 글자색)으로 고른 글자가 모든 색에서 읽힘(03 §3.1.4, 큰 글자·아이콘 기준 3:1 이상)
const { GOAL_PALETTE, textOn, contrast } = await import("../src/lib/palette.ts");
for (const c of GOAL_PALETTE) assert.ok(contrast(c.hex, textOn(c.hex)) >= 3, `${c.name} 글자 명암비`);
console.log(GOAL_PALETTE.map((c) => `${c.name} ${contrast(c.hex, textOn(c.hex)).toFixed(1)}`).join(", "));
console.log("목표 팔레트 확인 통과");
