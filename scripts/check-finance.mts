// 지출 규칙(src/server/finance.ts) 확인: node --env-file=.env scripts/check-finance.mts (개발 DB)
// 기본 분류 생성, 금액 검증, 남의 분류 사용 막기, 환불 차감, 달 경계
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { budgets, cardBenefits, cards, finCategories, paymentMethods, plannedExpenses, recurringPayments, revisions, transactions } from "../src/db/schema.ts";
import { AppError } from "../src/server/errors.ts";
import { createTransaction, formData, monthTransactions, totals } from "../src/server/finance.ts";
import type { Ctx } from "../src/server/repo.ts";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const A: Ctx = { userId: "check-fin-a", actor: "user" };
const B: Ctx = { userId: "check-fin-b", actor: "user" };
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? e.code : String(e)));
const users = ["check-fin-a", "check-fin-b"];

try {
  const fa = await formData(A);
  const food = fa.categories.find((c) => c.name === "식비")!;
  const luxury = fa.categories.find((c) => c.name === "사치")!;
  const salary = fa.categories.find((c) => c.name === "급여")!;
  assert.ok(food && luxury && salary, "기본 분류가 만들어짐");
  assert.equal(luxury.restraint, true, "사치만 참은 소비에 포함");
  assert.equal(fa.categories.filter((c) => c.restraint).length, 1);
  assert.equal(fa.paymentMethods[0]?.name, "현금");
  await formData(A); // 두 번 불러도 기본 분류가 또 생기지 않음
  assert.equal((await formData(A)).categories.length, fa.categories.length);

  const base = { type: "expense", date: "2026-11-01", categoryId: food.id };
  assert.equal(await code(createTransaction(A, { ...base, amount: 0 })), "VALIDATION_FAILED");
  assert.equal(await code(createTransaction(A, { ...base, amount: 1.5 })), "VALIDATION_FAILED");
  assert.equal(await code(createTransaction(A, { ...base, amount: 1000, categoryId: salary.id })), "VALIDATION_FAILED", "지출에 수입 분류 불가");
  await formData(B);
  assert.equal(await code(createTransaction(B, { ...base, amount: 1000 })), "VALIDATION_FAILED", "남의 분류 사용 불가");

  await createTransaction(A, { ...base, amount: 12000, title: "점심" });
  const lux = await createTransaction(A, { ...base, amount: 50000, categoryId: luxury.id });
  assert.equal(lux.restraint, true, "사치 지출은 참은 소비 안내");
  await createTransaction(A, { ...base, amount: 2000, isRefund: true });
  await createTransaction(A, { type: "income", amount: 100000, date: "2026-11-30", categoryId: salary.id });
  await createTransaction(A, { ...base, date: "2026-12-01", amount: 999 });
  const nov = await monthTransactions(A, "2026-11");
  assert.equal(nov.length, 4, "12월 1일은 11월에 안 들어감");
  assert.deepEqual(totals(nov), { expense: 12000 + 50000 - 2000, income: 100000 });
  assert.equal((await monthTransactions(B, "2026-11")).length, 0);
  console.log("지출 규칙 확인 통과");

  // 고정 지출: 주기별 필수 값, 해지 예정·해지됨, 남의 결제수단 불가
  const { createRecurring, scheduleEnd, endNow, cancelEnd, recurringList, upcoming, paysBetween } = await import("../src/server/recurring.ts");
  const { todayIn } = await import("../src/server/time.ts");
  const { addDays } = await import("../src/lib/recurring.ts");
  const today = todayIn();
  assert.equal(await code(createRecurring(A, { name: "넷플릭스", amount: 13500, cycle: "monthly" })), "VALIDATION_FAILED", "매월인데 날짜 없음");
  const pmB = (await formData(B)).paymentMethods[0];
  assert.equal(await code(createRecurring(A, { name: "x", amount: 1, cycle: "monthly", dayOfMonth: 1, paymentMethodId: pmB.id })), "VALIDATION_FAILED", "남의 결제수단 불가");
  const tomorrow = addDays(today, 1);
  const r = await createRecurring(A, { name: "넷플릭스", amount: 13500, cycle: "monthly", dayOfMonth: Number(tomorrow.slice(8)), weekday: 3, memo: "네이버플러스에 포함" });
  assert.equal(r.weekday, null, "주기에 필요 없는 값은 버림");
  let list = await recurringList(A);
  assert.equal(list[0].next, tomorrow);
  assert.equal(list[0].label, `매월 ${Number(tomorrow.slice(8))}일`);
  assert.deepEqual((await upcoming(A)).map((u) => u.date), [tomorrow]);
  assert.equal(await code(scheduleEnd(A, r.id, r.version, addDays(today, -1))), "VALIDATION_FAILED", "지난 날로 해지 예정 불가");
  const e = await scheduleEnd(A, r.id, r.version, today);
  list = await recurringList(A);
  assert.deepEqual([list[0].status, list[0].next], ["ending", null], "마지막 이용일 뒤 결제는 예정에서 빠짐");
  assert.equal(paysBetween({ ...e, lastUseDate: addDays(today, -1) }, today, addDays(today, 60)).length, 0);
  assert.equal(list[0].perMonth, 13500);
  const c = await cancelEnd(A, r.id, e.version);
  const n = await endNow(A, r.id, c.version);
  list = await recurringList(A);
  assert.deepEqual([list[0].status, list[0].perMonth, list[0].endedAt], ["ended", 0, today]);
  assert.equal(n.status, "ended");
  assert.equal((await recurringList(B)).length, 0);
  const { recurringRepo } = await import("../src/server/recurring.ts");
  const { restore } = await import("../src/server/repo.ts");
  await recurringRepo.remove(A, r.id);
  assert.equal((await recurringList(A)).length, 0);
  await restore(A, "recurring_payment", r.id);
  assert.equal((await recurringList(A)).length, 1, "삭제 되돌리기");
  console.log("고정 지출 규칙 확인 통과");

  // 예산: 저장·큰 지출 고치기·지난달 자동 복사·넘는 순간 알림·남의 분류 불가
  const { saveBudget, budgetView, budgetEffect, prevMonth } = await import("../src/server/budget.ts");
  const month = today.slice(0, 7);
  const prev = prevMonth(month);
  const fb = (await formData(B)).categories.find((c) => c.name === "식비")!;
  assert.equal(await code(saveBudget(A, prev, null, { lines: { [fb.id]: 1000 } })), "VALIDATION_FAILED", "남의 분류로 예산 불가");
  await saveBudget(A, prev, null, { lines: { [food.id]: 100000 }, planned: [{ name: "지난달 여행", amount: 50000 }], copyNext: true });
  assert.equal(await code(saveBudget(A, prev, null, { lines: {} })), "VERSION_CONFLICT", "같은 달 예산 두 번 만들기 불가");
  let view = await budgetView(A, month);
  assert.deepEqual(view.budget?.lines, { [food.id]: 100000 }, "이번 달 첫 진입: 분류별 예산 자동 복사");
  assert.equal(view.budget?.copied, true);
  assert.equal(view.planned.length, 0, "큰 지출은 복사 안 함");
  const used0 = view.summary.categories[0].used; // 위에서 넣은 이번 달 식비
  const line = used0 + 20000;
  const b1 = await saveBudget(A, month, view.budget!.version, { lines: { [food.id]: line }, planned: [{ name: "선물", amount: 30000 }, { name: "여행", amount: 300000 }], copyNext: false });
  view = await budgetView(A, month);
  const trip = view.planned.find((p) => p.name === "여행")!;
  await saveBudget(A, month, b1.version, { lines: { [food.id]: line }, planned: [{ id: trip.id, name: "여행", amount: 250000 }] });
  view = await budgetView(A, month);
  assert.deepEqual(view.planned.map((p) => [p.name, p.amount]), [["여행", 250000]], "빠진 큰 지출은 지움, 있는 건 고침");
  assert.equal(view.summary.total, view.summary.fixed + 250000 + line);
  await createTransaction(A, { ...base, date: today, amount: 15000 });
  const t1 = { categoryId: food.id, date: today, amount: 15000, isRefund: false, plannedExpenseId: null };
  assert.equal(await budgetEffect(A, t1), null, "아직 안 넘음");
  await createTransaction(A, { ...base, date: today, amount: 8000 });
  assert.deepEqual(await budgetEffect(A, { ...t1, amount: 8000 }), { category: "식비", over: 3000 }, "이번 저장으로 넘음");
  await createTransaction(A, { ...base, date: today, amount: 100000, plannedExpenseId: trip.id });
  view = await budgetView(A, month);
  assert.equal(view.summary.categories[0].used, used0 + 23000, "큰 지출에 연결한 지출은 분류 사용에서 빠짐");
  assert.equal(view.summary.planned[0].used, 100000);
  const pb = (await saveBudget(B, month, null, { planned: [{ name: "b", amount: 1 }] }), (await budgetView(B, month)).planned[0]);
  assert.equal(await code(createTransaction(A, { ...base, date: today, amount: 1, plannedExpenseId: pb.id })), "VALIDATION_FAILED", "남의 큰 지출 연결 불가");
  console.log("예산 규칙 확인 통과");

  // 분류 편집: 이름 바꾸기, 같은 이름·남의 분류 불가, 지우면 목록에서 빠짐
  const { createCategory, renameCategory, removeCategory } = await import("../src/server/finance.ts");
  const extra = await createCategory(A, { kind: "income", name: "확인용 수입" });
  await renameCategory(A, extra.id, "확인용 수입2");
  assert.equal((await formData(A)).categories.find((c) => c.id === extra.id)?.name, "확인용 수입2");
  assert.equal(await code(renameCategory(A, extra.id, salary.name)), "DUPLICATE");
  assert.equal(await code(renameCategory(B, extra.id, "x")), "NOT_FOUND");
  await removeCategory(A, extra.id);
  assert.ok(!(await formData(A)).categories.some((c) => c.id === extra.id), "지운 분류는 고르기 목록에서 빠짐");
  console.log("분류 편집 확인 통과");

  // 카드: 지출 입력에서 만든 카드도 목록에, 실적·혜택 예상, 남의 카드 불가, 입력 검사
  const { createCard, cardList, cardDetail, addBenefit, updateCard } = await import("../src/server/cards.ts");
  const { createPaymentMethod } = await import("../src/server/finance.ts");
  const quick = await createPaymentMethod(A, { kind: "card", name: "빠른카드" });
  const pmA = await createCard(A, { name: "A카드", issuer: "우나카드", cardType: "credit", billingDay: 14, perfExcludes: { categoryIds: [luxury.id], industries: [] } });
  assert.deepEqual((await cardList(A)).cards.map((c) => c.name).sort(), ["A카드", "빠른카드"], "지출 입력에서 만든 카드도 나옴");
  assert.equal(await code(cardDetail(B, pmA.id)), "NOT_FOUND", "남의 카드 못 봄");
  assert.equal(await code(addBenefit(B, pmA.id, { targetType: "industry", targets: ["카페"], benefitType: "discount", valueType: "percent", value: 10 })), "NOT_FOUND", "남의 카드에 혜택 불가");
  assert.equal(await code(addBenefit(A, pmA.id, { targetType: "industry", targets: ["카페"], benefitType: "discount", valueType: "percent", value: 150 })), "VALIDATION_FAILED", "100% 넘는 할인 불가");
  assert.equal(await code(addBenefit(A, pmA.id, { targetType: "industry", targets: ["카페"], benefitType: "discount", valueType: "percent", value: 10, limitType: "amount" })), "VALIDATION_FAILED", "한도 종류만 있고 금액 없음");
  await addBenefit(A, pmA.id, { targetType: "industry", targets: ["카페"], benefitType: "discount", valueType: "percent", value: 10, limitType: "amount", monthlyLimit: 5000 });
  await addBenefit(A, quick.id, { targetType: "merchant", targets: ["CGV"], benefitType: "discount", valueType: "amount", value: 4000 });
  await createTransaction(A, { ...base, date: today, amount: 30000, title: "스타벅스", paymentMethodId: pmA.id });
  await createTransaction(A, { ...base, date: today, amount: 70000, title: "투썸", paymentMethodId: pmA.id });
  await createTransaction(A, { ...base, date: today, amount: 50000, categoryId: luxury.id, paymentMethodId: pmA.id });
  const d = await cardDetail(A, pmA.id);
  assert.equal(d.perf, 100000, "사치 분류는 실적 제외");
  assert.deepEqual([d.limitUsed, d.limitTotal], [5000, 5000], "10% 할인이 월 한도 5,000원에서 멈춤");
  assert.equal(d.card?.verifiedAt, today, "혜택을 넣으면 최종 확인일이 오늘");
  assert.equal(await code(updateCard(A, pmA.id, 1, { name: "빠른카드" })), "DUPLICATE", "같은 이름 카드 불가");
  const renamed = await updateCard(A, quick.id, quick.version, { name: "B카드", billingDay: 1 });
  assert.equal(renamed.billingDay, 1);
  console.log("카드 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.delete(transactions).where(inArray(transactions.userId, users));
  await db.delete(recurringPayments).where(inArray(recurringPayments.userId, users));
  await db.delete(budgets).where(inArray(budgets.userId, users));
  await db.delete(cards).where(inArray(cards.userId, users));
  await db.delete(cardBenefits).where(inArray(cardBenefits.userId, users));
  await db.delete(plannedExpenses).where(inArray(plannedExpenses.userId, users));
  await db.delete(finCategories).where(inArray(finCategories.userId, users));
  await db.delete(paymentMethods).where(inArray(paymentMethods.userId, users));
  await db.delete(revisions).where(inArray(revisions.userId, users));
  process.exit(process.exitCode ?? 0);
}
