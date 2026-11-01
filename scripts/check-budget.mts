// 월별 예산 계산(src/lib/budget.ts) 확인: node scripts/check-budget.mts
// 06 §4: 총예산, 미래 날짜는 예정, 환불 차감, 큰 지출 연결은 분류 사용에서 빠짐, 상태 80%·100%
import assert from "node:assert/strict";
import { fromActual, statusOf, summarize, type BudgetTx } from "../src/lib/budget.ts";

const tx = (amount: number, categoryId: string, date = "2026-11-05", extra: Partial<BudgetTx> = {}): BudgetTx => ({ type: "expense", amount, isRefund: false, date, categoryId, plannedExpenseId: null, ...extra });

const s = summarize({
  lines: { food: 250000, shop: 100000 },
  planned: [
    { id: "trip", name: "여행", amount: 300000, manuallyDone: false },
    { id: "gift", name: "선물", amount: 100000, manuallyDone: true },
  ],
  fixed: 148500,
  today: "2026-11-10",
  txs: [
    tx(182000, "food"),
    tx(132000, "shop"),
    tx(2000, "shop", "2026-11-06", { isRefund: true }),
    tx(280000, "food", "2026-11-07", { plannedExpenseId: "trip" }), // 큰 지출에 연결 → 식비 사용에서 빠짐
    tx(12000, "etc"),
    tx(50000, "food", "2026-11-20"), // 미래 → 예정
    tx(5000, "food", "2026-11-08", { plannedExpenseId: "deleted" }), // 지운 큰 지출에 연결 → 다시 분류로
    { ...tx(100000, "salary"), type: "income" },
  ],
});
assert.equal(s.total, 148500 + 400000 + 350000);
assert.equal(s.spent, 182000 + 132000 - 2000 + 280000 + 12000 + 5000);
assert.equal(s.scheduled, 50000);
assert.equal(s.left, s.total - s.spent);
assert.deepEqual(s.categories.map((c) => [c.categoryId, c.used, c.status]), [
  ["food", 187000, "ok"],
  ["shop", 130000, "over"],
]);
assert.deepEqual(s.noBudget, [{ categoryId: "etc", used: 12000 }]);
assert.deepEqual(s.planned.map((p) => [p.id, p.used, p.state]), [
  ["trip", 280000, "partial"],
  ["gift", 0, "done"],
]);

assert.equal(statusOf(79, 100), "ok");
assert.equal(statusOf(80, 100), "warn");
assert.equal(statusOf(100, 100), "warn", "딱 맞게 쓰면 주의");
assert.equal(statusOf(101, 100), "over");
assert.equal(statusOf(1, 0), "over");
assert.equal(statusOf(0, 0), "ok");
assert.deepEqual(fromActual([{ categoryId: "a", used: 182300 }, { categoryId: "b", used: 0 }]), { a: 183000 });
console.log("예산 계산 확인 통과");
