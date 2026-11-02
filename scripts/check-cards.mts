// 카드 실적·혜택 계산(src/lib/cards.ts) 확인: node scripts/check-cards.mts
// 06 §6.3·6.4: 업종 추정, 실적 제외, 전월 실적 구간, 1회 최대·월 한도(금액·횟수)·최소 금액·요일
import assert from "node:assert/strict";
import { benefitUsage, industryOf, matches, performance, perfTarget, tierFor, type Benefit, type CardTx } from "../src/lib/cards.ts";

assert.equal(industryOf("스타벅스 강남점"), "카페");
assert.equal(industryOf("이마트24 역삼"), "편의점", "긴 이름 먼저(이마트로 잡히지 않음)");
assert.equal(industryOf("cgv 용산"), "영화", "대소문자·띄어쓰기 무시");
assert.equal(industryOf("점심"), null);

const tx = (id: string, amount: number, title: string | null, date = "2026-11-05", extra: Partial<CardTx> = {}): CardTx => ({ id, amount, isRefund: false, date, categoryId: "food", title, ...extra });

// 실적: 환불 차감, 제외 분류·업종 빼기
const txs = [tx("a", 100000, "쿠팡"), tx("b", 50000, "점심"), tx("c", 20000, "쿠팡", "2026-11-06", { isRefund: true }), tx("d", 30000, "관리비", "2026-11-07", { categoryId: "tax" }), tx("e", 10000, "넷플릭스")];
assert.equal(performance(txs, { categoryIds: [], industries: [] }), 100000 + 50000 - 20000 + 30000 + 10000);
assert.equal(performance(txs, { categoryIds: ["tax"], industries: ["구독"] }), 130000);

const base: Benefit = { targetType: "industry", targets: ["카페"], valueType: "percent", value: 10, perTxnMax: null, minAmount: null, limitType: "none", monthlyLimit: null, tiers: [], daysOfWeek: null };

// 구간: 30만 이상 10%, 50만 이상 15%·한도 덮어쓰기
const tiered = { ...base, tiers: [{ minPrevPerf: 300000 }, { minPrevPerf: 500000, value: 15, limit: 20000 }], monthlyLimit: 10000 };
assert.equal(tierFor(tiered, 299999).applies, false, "구간 못 넘으면 혜택 없음");
assert.deepEqual([tierFor(tiered, 300000).value, tierFor(tiered, 300000).limit], [10, 10000]);
assert.deepEqual([tierFor(tiered, 600000).value, tierFor(tiered, 600000).limit], [15, 20000]);
assert.equal(perfTarget([tiered, base]), 300000);
assert.equal(perfTarget([base]), null);

// 대상
assert.equal(matches({ targetType: "merchant", targets: ["CGV", "메가박스"] }, "메가박스 코엑스"), true);
assert.equal(matches({ targetType: "merchant", targets: ["CGV"] }, null), false);

// 1회 최대 + 월 한도(금액): 날짜 순으로 채움
const cafe = [tx("1", 6000, "스타벅스", "2026-11-03"), tx("2", 60000, "투썸", "2026-11-01"), tx("3", 50000, "메가커피", "2026-11-10"), tx("4", 9000, "점심")];
const u = benefitUsage({ ...base, perTxnMax: 5000, limitType: "amount", monthlyLimit: 8000 }, cafe, 0);
assert.deepEqual(u.items, [
  { txId: "2", amount: 5000 }, // 6,000 → 1회 최대 5,000
  { txId: "1", amount: 600 },
  { txId: "3", amount: 2400 }, // 한도 8,000까지 남은 만큼
]);
assert.equal(u.used, 8000);

// 횟수 한도·최소 금액·요일(2026-11-01 일요일)
assert.equal(benefitUsage({ ...base, limitType: "count", monthlyLimit: 2 }, cafe, 0).count, 2);
assert.deepEqual(benefitUsage({ ...base, minAmount: 10000 }, cafe, 0).items.map((i) => i.txId), ["2", "3"]);
assert.deepEqual(benefitUsage({ ...base, daysOfWeek: [0] }, cafe, 0).items.map((i) => i.txId), ["2"], "일요일(11/1)만");
// 정액
assert.equal(benefitUsage({ ...base, valueType: "amount", value: 1000 }, cafe, 0).used, 3000);
// 환불은 혜택 없음
assert.equal(benefitUsage(base, [tx("r", 10000, "스타벅스", "2026-11-05", { isRefund: true })], 0).used, 0);
console.log("카드 계산 확인 통과");
