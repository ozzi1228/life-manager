// 작업 기록(src/server/activity.ts) 확인: node --env-file=.env --no-warnings scripts/check-activity.mts (개발 DB)
// 동작 한 번 = 한 줄, 추가·수정·삭제 되돌리기, 최근 것부터만, 되돌린 줄 표시, 남의 기록 안 보임
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { accounts, cards, finCategories, paymentMethods, pays, revisions, transactions } from "../src/db/schema.ts";
import { activityList, undoActivity } from "../src/server/activity.ts";
import { createCard, removePaymentMethod } from "../src/server/cards.ts";
import { AppError } from "../src/server/errors.ts";
import { createTransaction, formData, txRepo, updateTransaction } from "../src/server/finance.ts";
import type { Ctx } from "../src/server/repo.ts";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const users = ["check-act-a", "check-act-b"];
let n = 0;
const A = (): Ctx => ({ userId: users[0], actor: "user", requestId: `req-${++n}` }); // 동작마다 새 요청
const B: Ctx = { userId: users[1], actor: "user", requestId: "req-b" };
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? e.code : String(e)));

try {
  const food = (await formData(A())).categories.find((c) => c.name === "식비")!;
  const { row } = await createTransaction(A(), { type: "expense", amount: 12000, date: "2026-11-05", categoryId: food.id, title: "점심" });
  let list = await activityList(A());
  assert.equal(list[0].verb, "추가");
  assert.match(list[0].name, /점심/);
  assert.equal((await activityList(B)).length, 0, "남의 기록 안 보임");

  await updateTransaction(A(), row.id, 1, { type: "expense", amount: 15000, date: "2026-11-05", categoryId: food.id, title: "점심" });
  list = await activityList(A());
  assert.equal(list[0].verb, "수정");
  assert.deepEqual(list[0].changes, [{ label: "금액", before: "12,000원", after: "15,000원" }]);
  assert.equal(list[1].canUndo, false, "뒤에 수정이 있으면 추가는 아직 못 되돌림");
  assert.equal(await code(undoActivity(A(), list[1].key)), "VALIDATION_FAILED");

  await undoActivity(A(), list[0].key);
  assert.equal((await txRepo.get(A(), row.id)).amount, 12000, "수정 되돌리기 = 고치기 전 값");
  list = await activityList(A());
  assert.ok(list[0].undoneAt && !list[0].canUndo, "되돌린 줄은 되돌림 표시");
  assert.equal(list[1].canUndo, true, "최근 것을 되돌리면 그 전 것도 되돌릴 수 있음");
  assert.equal(await code(undoActivity(A(), list[0].key)), "VALIDATION_FAILED", "두 번 못 되돌림");

  await undoActivity(A(), list[1].key);
  assert.equal(await code(txRepo.get(A(), row.id)), "NOT_FOUND", "추가 되돌리기 = 휴지통");

  const pm = await createCard(A(), { name: "확인카드", memo: "메모" });
  await removePaymentMethod(A(), "card", pm.id);
  list = await activityList(A());
  assert.equal(list[0].verb, "삭제");
  assert.equal(list[0].name, "확인카드 카드");
  assert.equal(list[0].others, 0, "카드 설정 행은 따로 세지 않음");
  await undoActivity(A(), list[0].key);
  const { cardList } = await import("../src/server/cards.ts");
  assert.equal((await cardList(A())).find((c) => c.id === pm.id)?.card?.memo, "메모", "삭제 되돌리기 = 설정까지 복구");
  assert.equal(await code(undoActivity(B, list[0].key)), "NOT_FOUND", "남의 줄 못 되돌림");
  console.log("작업 기록 확인 통과");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [transactions, cards, pays, accounts, finCategories, paymentMethods, revisions]) await db.delete(t).where(inArray(t.userId, users));
  process.exit(process.exitCode ?? 0);
}
