// 지출 규칙(src/server/finance.ts) 확인: node --env-file=.env scripts/check-finance.mts (개발 DB)
// 기본 분류 생성, 금액 검증, 남의 분류 사용 막기, 환불 차감, 달 경계
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { finCategories, paymentMethods, recurringPayments, revisions, transactions } from "../src/db/schema.ts";
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
} finally {
  await db.delete(transactions).where(inArray(transactions.userId, users));
  await db.delete(recurringPayments).where(inArray(recurringPayments.userId, users));
  await db.delete(finCategories).where(inArray(finCategories.userId, users));
  await db.delete(paymentMethods).where(inArray(paymentMethods.userId, users));
  await db.delete(revisions).where(inArray(revisions.userId, users));
  process.exit(process.exitCode ?? 0);
}
