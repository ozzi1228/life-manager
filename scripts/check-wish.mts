// 위시·위시 분류·참은 소비 규칙(src/server/wish.ts·item-categories.ts·restraint.ts) 확인: node --env-file=.env scripts/check-wish.mts (개발 DB)
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");

const { db } = await import("../src/db/index.ts");
const { budgets, finCategories, itemCategories, paymentMethods, plannedExpenses, restraintEntries, restraintMonths, revisions, transactions, wishItems } = await import("../src/db/schema.ts");
const { AppError } = await import("../src/server/errors.ts");
const { createTransaction, formData } = await import("../src/server/finance.ts");
const { prevMonth, saveBudget } = await import("../src/server/budget.ts");
const { createRestraint, resettle, restraintView } = await import("../src/server/restraint.ts");
const { todayIn } = await import("../src/server/time.ts");
const { createWish, dropWish, purchaseWish, reopenWish, updateWish, wishList, wishRepo } = await import("../src/server/wish.ts");
const { addItemCategory, categoryList, removeItemCategory } = await import("../src/server/item-categories.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-wish-a", actor: "user" };
const B: Ctx = { userId: "check-wish-b", actor: "user" };
const users = [A.userId, B.userId];
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? (e.extra.fields?.[0]?.message ?? e.code) : String(e)));

try {
  // 분류: 이름만, 기본 물건·영화·드라마·책, 마음대로 추가, 마지막 하나는 못 지움
  const cats = await categoryList(A);
  assert.deepEqual(cats.map((c) => c.name), ["물건", "영화", "드라마", "책"]);
  await addItemCategory(A, "뮤지컬");
  assert.equal(await code(addItemCategory(A, "뮤지컬")), "이미 같은 이름의 분류가 있어요");
  assert.equal((await categoryList(A)).length, 5, "다시 불러도 기본 분류가 또 생기지 않음");
  const [thing, movie] = cats;
  const bCats = await categoryList(B);
  for (const c of bCats.slice(1)) await removeItemCategory(B, c.id);
  assert.equal(await code(removeItemCategory(B, bCats[0].id)), "VALIDATION_FAILED", "마지막 분류는 못 지움");

  // 위시: 이름만 있으면 담김(가격·분류 선택), 링크 검사, 남의 분류는 못 씀
  const film = await createWish(A, { name: "듄 3", categoryId: movie.id, seenWhere: "친구 추천" });
  assert.deepEqual([film.price, film.categoryId, film.status], [null, movie.id, "saved"]);
  assert.equal(await code(createWish(A, { name: "   " })), "이름을 입력해 주세요");
  assert.equal(await code(createWish(A, { name: "x", links: ["javascript:alert(1)"] })), "링크를 다시 확인해 주세요");
  assert.equal(await code(createWish(A, { name: "x", categoryId: bCats[0].id })), "분류를 다시 골라 주세요");
  const w = await createWish(A, { name: "무선 청소기", categoryId: thing.id, price: 289000, links: ["coupang.com/vp/1"] });
  assert.deepEqual(w.links, ["https://coupang.com/vp/1"]);
  // 다른 통화 가격: price는 원화 환산액, 원래 금액은 foreign_amount. 가격이 없으면 통화도 원
  const jp = await createWish(A, { name: "도쿄 우산", price: 27000, currency: "JPY", foreignAmount: 3000 });
  assert.deepEqual([jp.price, jp.currency, jp.foreignAmount], [27000, "JPY", 3000]);
  assert.equal(await code(createWish(A, { name: "x", price: 1000, currency: "USD" })), "금액을 입력해 주세요");
  const noPrice = await createWish(A, { name: "책", currency: "USD", foreignAmount: 100 });
  assert.deepEqual([noPrice.currency, noPrice.foreignAmount], ["KRW", null]);
  const up = await updateWish(A, film.id, film.version, { name: "듄 3", categoryId: null });
  assert.equal(up.categoryId, null, "분류 빼기");

  // 했어요: 가격 있으면 지출 연결(한 트랜잭션), 없으면 그냥. 되돌리기 → 지출 휴지통
  const shop = (await formData(A)).categories.find((c) => c.name === "쇼핑")!;
  const r = await purchaseWish(A, w.id, w.version, { type: "expense", amount: 279000, date: "2026-11-02", categoryId: shop.id, title: "무선 청소기" });
  let item = (await wishList(A)).find((x) => x.id === w.id)!;
  assert.deepEqual([item.status, item.doneAt, item.hasTx, item.txGone], ["bought", "2026-11-02", true, false]);
  assert.equal(await code(purchaseWish(A, w.id, item.version, null)), "VERSION_CONFLICT", "두 번은 안 됨");
  assert.equal((await purchaseWish(A, up.id, up.version, null)).wish.status, "bought", "작품은 지출 없이 했어요");
  const bad = await createWish(A, { name: "가방", price: 159000 });
  assert.equal(await code(purchaseWish(A, bad.id, bad.version, { type: "expense", amount: 1, date: "2026-11-02", categoryId: "00000000-0000-7000-8000-000000000000" })), "분류를 골라 주세요");
  assert.equal((await wishRepo.get(A, bad.id)).status, "saved", "지출이 실패하면 상태도 그대로");
  await reopenWish(A, w.id, item.version, true);
  item = (await wishList(A)).find((x) => x.id === w.id)!;
  assert.deepEqual([item.status, item.hasTx], ["saved", false]);
  const txRow = await db.select().from(transactions).where(inArray(transactions.id, [r.transaction!.row.id]));
  assert.ok(txRow[0].deletedAt, "연결 지출은 휴지통으로");

  // 그만둠·다시 담기. 가격 없는 건 참은 소비로 기록하지 않음
  const d = await dropWish(A, bad.id, bad.version, "  비슷한 게 있음 ");
  assert.deepEqual([d.status, d.droppedReason], ["dropped", "비슷한 게 있음"]);
  assert.equal((await reopenWish(A, bad.id, d.version)).status, "saved");
  const n = await wishRepo.get(A, noPrice.id);
  await dropWish(A, noPrice.id, n.version, null, true);
  assert.equal((await wishList(A)).find((x) => x.id === noPrice.id)?.restrained, null);
  assert.equal((await wishList(B)).length, 0, "남의 위시는 안 보임");
  console.log("위시 규칙 확인 통과");

  // ── 참은 소비(20): 갚기 체크 + 예산 초과, 직접 기록·위시에서 고르기, 그만둘 때 기록, 나중에 산 물건, 넘기기. 위시 자동 포함은 없음 ──
  const R: Ctx = { userId: "check-wish-r", actor: "user" };
  users.push(R.userId);
  const cur = todayIn().slice(0, 7);
  const prev = prevMonth(cur);
  const today = todayIn();
  const fin = (await formData(R)).categories;
  const [lux, food] = ["쇼핑", "식비"].map((x) => fin.find((c) => c.name === x)!);
  const w1 = await createWish(R, { name: "무선 이어폰", price: 89000 });
  const w2 = await createWish(R, { name: "가죽 가방", price: 30000 });
  await saveBudget(R, cur, null, { lines: { [food.id]: 10000 } });
  await createTransaction(R, { type: "expense", amount: 50000, date: today, categoryId: lux.id, restraint: true });
  await createTransaction(R, { type: "expense", amount: 15000, date: today, categoryId: food.id });

  let rv = await restraintView(R, cur);
  assert.deepEqual([rv.detail.luxury, rv.detail.overage.map((o) => [o.name, o.over]), rv.detail.carriedIn, rv.target], [50000, [["식비", 5000]], 0, 55000]);
  let pv = await restraintView(R, prev);
  assert.deepEqual([pv.closed, pv.entries.length], [true, 0], "지난달 정산: 안 산 위시가 저절로 들어가지 않음");
  assert.deepEqual(rv.pickable.map((p) => p.name).sort(), ["가죽 가방", "무선 이어폰"], "위시에서 고르기: 가격 있는 담아둔 것");

  // 직접 기록 + 위시에서 고르기(한 번만)
  await createRestraint(R, { name: "한정판 운동화", amount: 20000, date: today, reason: "비슷한 게 있음" });
  await createRestraint(R, { name: "가죽 가방", amount: 30000, date: today, wishItemId: w2.id });
  assert.equal(await code(createRestraint(R, { name: "x", amount: 1, date: today, wishItemId: w2.id })), "DUPLICATE");
  rv = await restraintView(R, cur);
  assert.deepEqual([rv.filled, rv.pickable.map((p) => p.name)], [50000, ["무선 이어폰"]]);

  // 그만둘 때 기록 → 달성
  const w3 = await createWish(R, { name: "향수", price: 40000 });
  await dropWish(R, w3.id, w3.version, null, true);
  rv = await restraintView(R, cur);
  assert.equal(rv.filled, 90000);
  assert.equal((await wishList(R)).find((x) => x.id === w3.id)?.restrained?.month, cur, "위시에 ○월에 참음");

  // 참았던 위시를 삼 → 산 달 참아야 할 금액에 더함, 되돌리면 빠짐(D-041)
  await purchaseWish(R, w2.id, (await wishRepo.get(R, w2.id)).version, { type: "expense", amount: 30000, date: today, categoryId: lux.id });
  rv = await restraintView(R, cur);
  assert.deepEqual([rv.target, rv.detail.laterBought], [55000 + 30000, 30000]);
  await reopenWish(R, w2.id, (await wishRepo.get(R, w2.id)).version, true);
  rv = await restraintView(R, cur);
  assert.equal(rv.target, 55000);

  // 지난달: 갚기 지출 추가 → 다시 정산 필요 → 부족분이 이번 달로 넘어옴
  await createTransaction(R, { type: "expense", amount: 100000, date: `${prev}-20`, categoryId: lux.id, restraint: true });
  pv = await restraintView(R, prev);
  assert.equal(pv.stale, true, "정산 뒤 바뀜");
  await resettle(R, prev);
  pv = await restraintView(R, prev);
  assert.deepEqual([pv.stale, pv.target, pv.filled, pv.carryOut], [false, 100000, 0, 100000]);
  rv = await restraintView(R, cur);
  assert.deepEqual([rv.detail.carriedIn, rv.target], [100000, 155000]);
  assert.ok(w1, "담아 둔 위시");
  assert.equal((await restraintView(B, cur)).entries.length, 0, "남의 기록은 안 보임");
  console.log("참은 소비 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [wishItems, itemCategories, transactions, finCategories, paymentMethods, budgets, plannedExpenses, restraintEntries, restraintMonths, revisions]) await db.delete(t).where(inArray(t.userId, users));
  process.exit(process.exitCode ?? 0);
}
