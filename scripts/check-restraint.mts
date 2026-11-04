// 참은 소비 계산(src/lib/restraint.ts) 확인: node scripts/check-restraint.mts
// 20 §3: "참아서 갚기" 지출 이중 계산 제외, 환불 차감, 예산 없는 분류, 예정 지출 제외 / §4.2 위시 자동 포함 조건
import assert from "node:assert/strict";
import { autoEligible, fillState, restraintTarget } from "../src/lib/restraint.ts";

// "lux" 분류에 넣은 것은 갚기 체크한 지출로 침
const tx = (amount: number, categoryId: string, date = "2026-10-10", isRefund = false, restraint = categoryId === "lux") => ({ amount, categoryId, date, isRefund, restraint });
const base = { carriedIn: 0, laterBought: 0, today: "2026-10-31" };

// 20 §7 예시: 사치 139,000 + 식비 초과 18,000 + 쇼핑 초과 25,000 = 182,000
const ex = restraintTarget({
  ...base,
  txs: [tx(89000, "lux"), tx(50000, "lux"), tx(300000, "food")],
  categories: [
    { categoryId: "food", budget: 282000, used: 300000 },
    { categoryId: "shop", budget: 100000, used: 125000 },
    { categoryId: "cafe", budget: 50000, used: 20000 },
  ],
});
assert.deepEqual([ex.luxury, ex.overage.map((o) => o.over), ex.target], [139000, [18000, 25000], 182000]);

// 사치 분류에 예산이 있어도 초과액은 또 더하지 않음
assert.equal(restraintTarget({ ...base, txs: [tx(100000, "lux")], categories: [{ categoryId: "lux", budget: 30000, used: 100000 }] }).target, 100000, "이중 계산 없음");
// 환불 차감, 음수가 되지 않음
assert.equal(restraintTarget({ ...base, txs: [tx(50000, "lux"), tx(20000, "lux", "2026-10-11", true)], categories: [] }).luxury, 30000);
assert.equal(restraintTarget({ ...base, txs: [tx(20000, "lux", "2026-10-11", true)], categories: [] }).luxury, 0);
// 예산 없는 분류는 초과 0(목록에 없음), 예정(오늘 뒤) 사치 지출은 안 셈
assert.equal(restraintTarget({ ...base, today: "2026-10-15", txs: [tx(10000, "lux", "2026-10-20"), tx(999999, "food")], categories: [] }).target, 0);
// 같은 분류 안에서 갚기 체크한 지출은 예산 초과에서 빼고 셈: 식비 예산 100,000에 일반 80,000 + 갚기 50,000 → 50,000만(초과 0)
assert.equal(restraintTarget({ ...base, txs: [tx(80000, "food"), tx(50000, "food", "2026-10-10", false, true)], categories: [{ categoryId: "food", budget: 100000, used: 130000 }] }).target, 50000);
// 넘어온 금액·나중에 산 물건
assert.equal(restraintTarget({ ...base, txs: [], categories: [], carriedIn: 32000, laterBought: 159000 }).target, 191000);

assert.deepEqual([fillState(0, 0), fillState(100, 50), fillState(100, 100)], ["none", "progress", "done"]);

// 위시 자동 포함: 그 달 1일 전에 담은 갖고 싶음·관심, 담아둠, 가격 있음, 센 적 없음
const w = { kind: "shopping", status: "saved", level: "want", price: 89000, createdDate: "2026-09-20", counted: false };
assert.equal(autoEligible(w, "2026-10"), true);
assert.equal(autoEligible({ ...w, createdDate: "2026-10-01" }, "2026-10"), false, "월중에 담으면 다음 달부터");
assert.equal(autoEligible({ ...w, level: "need" }, "2026-10"), false, "필요는 제외");
assert.equal(autoEligible({ ...w, status: "bought" }, "2026-10"), false);
assert.equal(autoEligible({ ...w, counted: true }, "2026-10"), false, "한 물건은 한 번만(D-039)");
assert.equal(autoEligible({ ...w, kind: "media", level: null }, "2026-10"), false);
console.log("참은 소비 계산 확인 통과");
