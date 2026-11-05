// 계좌 계산(src/lib/accounts.ts) 확인: node scripts/check-accounts.mts
import assert from "node:assert/strict";
import { daysUntil, expectedInterest, monthsBetween, stockProfit } from "../src/lib/accounts.ts";

assert.equal(monthsBetween("2026-01-15", "2027-01-15"), 12);
assert.equal(monthsBetween("2026-01-15", "2027-01-14"), 11, "만기일이 시작 날짜 전이면 한 달 덜");
assert.equal(monthsBetween("2027-01-01", "2026-01-01"), 0);

// 예금 1,000만 원 · 연 3.5% · 12개월 → 350,000원, 세금 15.4% 53,900원
const dep = { category: "deposit", principal: 10_000_000, rate: 3.5, tax: "normal", startDate: "2026-01-01", maturityDate: "2027-01-01" } as const;
assert.deepEqual(expectedInterest(dep), { months: 12, gross: 350_000, tax: 53_900, net: 296_100, paid: 10_000_000, total: 10_296_100 });
assert.equal(expectedInterest({ ...dep, tax: "free" })!.net, 350_000);
// 적금 월 30만 원 · 연 4% · 12개월 → 300000 × 0.04/12 × 78 = 78,000원
const sav = expectedInterest({ ...dep, category: "savings", principal: 300_000, rate: 4, tax: "preferential" })!;
assert.equal(sav.gross, 78_000);
assert.equal(sav.tax, 7_410);
assert.equal(sav.total, 3_600_000 + 78_000 - 7_410);
assert.equal(expectedInterest({ ...dep, rate: null }), null, "칸이 비면 계산 안 함");
assert.equal(expectedInterest({ ...dep, category: "checking" }), null);

assert.deepEqual(stockProfit(1_000_000, 1_123_000), { profit: 123_000, pct: 12.3 });
assert.deepEqual(stockProfit(1_000_000, 900_000), { profit: -100_000, pct: -10 });
assert.equal(stockProfit(null, 5), null);
assert.equal(daysUntil("2026-11-10", "2026-11-05"), 5);
console.log("계좌 계산 확인 끝");
