// 지출 규칙(src/server/finance.ts) 확인: node --env-file=.env scripts/check-finance.mts (개발 DB)
// 기본 분류 생성, 금액 검증, 남의 분류 사용 막기, 환불 차감, 달 경계
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { finCategories, paymentMethods, revisions, transactions } from "../src/db/schema.ts";
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
} finally {
  await db.delete(transactions).where(inArray(transactions.userId, users));
  await db.delete(finCategories).where(inArray(finCategories.userId, users));
  await db.delete(paymentMethods).where(inArray(paymentMethods.userId, users));
  await db.delete(revisions).where(inArray(revisions.userId, users));
  process.exit(process.exitCode ?? 0);
}
