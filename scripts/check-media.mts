// 작품 기록·위시·참은 소비 규칙(src/server/media.ts·wish.ts·restraint.ts, src/lib/media.ts) 확인: node --env-file=.env scripts/check-media.mts (개발 DB)
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");

const { db } = await import("../src/db/index.ts");
const { budgets, finCategories, mediaLogs, mediaWorks, paymentMethods, plannedExpenses, restraintEntries, restraintMonths, revisions, transactions, wishItems } = await import("../src/db/schema.ts");
const { AppError } = await import("../src/server/errors.ts");
const { createTransaction, formData } = await import("../src/server/finance.ts");
const { prevMonth, saveBudget } = await import("../src/server/budget.ts");
const { createRestraint, resettle, restraintView, setExcluded } = await import("../src/server/restraint.ts");
const { todayIn } = await import("../src/server/time.ts");
const { createMedia, mediaList, removeMedia, updateMedia } = await import("../src/server/media.ts");
const { createWish, dropWish, purchaseWish, reopenWish, wishList, wishRepo } = await import("../src/server/wish.ts");
const { calendarDay, monthSummary } = await import("../src/lib/media.ts");
const { restore } = await import("../src/server/repo.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-med-a", actor: "user" };
const B: Ctx = { userId: "check-med-b", actor: "user" };
const users = [A.userId, B.userId];
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? (e.extra.fields?.[0]?.message ?? e.code) : String(e)));

try {
  // 캘린더에 놓이는 날(08 §3.3)
  assert.deepEqual(calendarDay("book", { status: "done", startDate: "2026-10-01", endDate: "2026-11-03" }), { date: "2026-11-03", faint: false });
  assert.equal(calendarDay("book", { status: "ongoing", startDate: "2026-11-01", endDate: null }), null, "읽는 중은 띠로");
  assert.deepEqual(calendarDay("drama", { status: "ongoing", startDate: "2026-11-01", endDate: null }), { date: "2026-11-01", faint: true });
  assert.equal(monthSummary([{ kind: "book", status: "done", endDate: "2026-11-02" }, { kind: "movie", status: "done", endDate: "2026-11-05" }, { kind: "movie", status: "done", endDate: "2026-11-09" }, { kind: "book", status: "ongoing", endDate: null }], "2026-11"), "책 1권 · 영화 2편");

  // 작품 기록: 날짜 규칙, 영화는 봤어요만
  const book = { kind: "book" as const, title: "작별하지 않는다", status: "done" as const, startDate: "2026-11-05", endDate: "2026-11-01" };
  assert.equal(await code(createMedia(A, book)), "끝난 날이 시작한 날보다 빨라요");
  assert.equal(await code(createMedia(A, { ...book, status: "ongoing", startDate: null })), "시작한 날을 골라 주세요");
  assert.equal(await code(createMedia(A, { kind: "movie", title: "파묘", status: "ongoing", startDate: "2026-11-01" })), "상태를 다시 골라 주세요");
  assert.equal(await code(createMedia(A, { ...book, rating: 4.3, endDate: "2026-11-10" })), "별점을 다시 골라 주세요");
  const m = await createMedia(A, { kind: "movie", title: "파묘", status: "done", startDate: "2026-10-01", endDate: "2026-11-02", rating: 4.5 });
  const b = await createMedia(A, { ...book, status: "ongoing", endDate: "2026-11-20" });
  let list = await mediaList(A);
  assert.deepEqual([list.find((x) => x.id === m.id)?.startDate, list.find((x) => x.id === b.id)?.endDate], [null, null], "영화는 본 날만, 읽는 중은 끝난 날 없음");
  const u = await updateMedia(A, b.id, b.version, { ...book, startDate: "2026-11-01", endDate: "2026-11-10", rating: 5 });
  assert.equal(u.version, 2);
  assert.equal(await code(updateMedia(A, b.id, b.version, { ...book, startDate: "2026-11-01", endDate: "2026-11-10" })), "VERSION_CONFLICT");
  assert.equal((await mediaList(B)).length, 0, "남의 기록은 안 보임");
  await removeMedia(A, m.id);
  assert.equal((await mediaList(A)).length, 1);
  await restore(A, "media_log", m.id);
  list = await mediaList(A);
  assert.equal(list.find((x) => x.id === m.id)?.title, "파묘", "기록·작품 함께 복구");

  // 쇼핑 위시: 가격 필수, 기본 구분 관심
  assert.equal(await code(createWish(A, { kind: "shopping", name: "무선 청소기" })), "가격을 입력해 주세요");
  assert.equal(await code(createWish(A, { kind: "shopping", name: "x", price: 1000, links: ["javascript:alert(1)"] })), "링크를 다시 확인해 주세요");
  const w = await createWish(A, { kind: "shopping", name: "무선 청소기", price: 289000, links: ["coupang.com/vp/1"] });
  assert.deepEqual([w.level, w.links], ["like", ["https://coupang.com/vp/1"]]);

  // 구매함 → 지출 연결(한 트랜잭션), 되돌리기 → 지출 휴지통
  const shop = (await formData(A)).categories.find((c) => c.name === "쇼핑")!;
  const r = await purchaseWish(A, w.id, w.version, { type: "expense", amount: 279000, date: "2026-11-02", categoryId: shop.id, title: "무선 청소기" });
  let item = (await wishList(A)).find((x) => x.id === w.id)!;
  assert.deepEqual([item.status, item.doneAt, item.hasTx, item.txGone], ["bought", "2026-11-02", true, false]);
  assert.equal(await code(purchaseWish(A, w.id, item.version, null)), "VERSION_CONFLICT", "두 번 구매 안 됨");
  const bad = await createWish(A, { kind: "shopping", name: "가방", level: "want", price: 159000 });
  assert.equal(await code(purchaseWish(A, bad.id, bad.version, { type: "expense", amount: 1, date: "2026-11-02", categoryId: "00000000-0000-7000-8000-000000000000" })), "분류를 골라 주세요");
  assert.equal((await wishRepo.get(A, bad.id)).status, "saved", "지출이 실패하면 상태도 그대로");
  await reopenWish(A, w.id, item.version, true);
  item = (await wishList(A)).find((x) => x.id === w.id)!;
  assert.deepEqual([item.status, item.hasTx], ["saved", false]);
  const txRow = await db.select().from(transactions).where(inArray(transactions.id, [r.transaction!.row.id]));
  assert.ok(txRow[0].deletedAt, "연결 지출은 휴지통으로");

  // 그만둠·다시 담기
  const d = await dropWish(A, bad.id, bad.version, "  비슷한 게 있음 ");
  assert.deepEqual([d.status, d.droppedReason], ["dropped", "비슷한 게 있음"]);
  assert.equal((await reopenWish(A, bad.id, d.version)).status, "saved");

  // 작품 위시 → 다 봤어요: 작품 기록 생성 + 위시 다 봄
  const mw = await createWish(A, { kind: "media", mediaKind: "drama", name: "더 글로리", seenWhere: "친구 추천" });
  assert.equal(mw.price, null);
  assert.equal(await code(purchaseWish(A, mw.id, mw.version, null)), "BAD_REQUEST");
  const log = await createMedia(A, { kind: "drama", title: "더 글로리", status: "done", startDate: "2026-11-01", endDate: "2026-11-02" }, { id: mw.id, version: mw.version });
  const mwNow = await wishRepo.get(A, mw.id);
  assert.deepEqual([mwNow.status, mwNow.mediaLogId], ["finished", log.id]);
  assert.equal(await code(createWish(B, { kind: "media", name: "x" })), "종류를 골라 주세요");
  console.log("작품 기록·위시 규칙 확인 통과");

  // ── 참은 소비(20): 갚기 체크 + 예산 초과, 지난달 정산·위시 자동 포함, 직접 기록·위시에서 고르기, 그만둘 때 기록, 나중에 산 물건, 넘기기 ──
  const R: Ctx = { userId: "check-med-r", actor: "user" };
  users.push(R.userId);
  const cur = todayIn().slice(0, 7);
  const prev = prevMonth(cur);
  const today = todayIn();
  const cats = (await formData(R)).categories;
  const [lux, food, shopCat] = ["쇼핑", "식비", "쇼핑"].map((n) => cats.find((c) => c.name === n)!);
  const back = (id: string, day: string) => db.update(wishItems).set({ createdAt: new Date(`${day}T12:00:00+09:00`) }).where(eq(wishItems.id, id));
  const w1 = await createWish(R, { kind: "shopping", name: "무선 이어폰", level: "want", price: 89000 });
  await back(w1.id, `${prevMonth(prev)}-15`); // 지난달 1일 전부터 담아 둠 → 지난달 정산에 자동 포함
  const w2 = await createWish(R, { kind: "shopping", name: "가죽 가방", level: "like", price: 30000 });
  await back(w2.id, `${prev}-10`); // 지난달 중간에 담음 → 이번 달 후보
  const wNeed = await createWish(R, { kind: "shopping", name: "청소기", level: "need", price: 200000 });
  await back(wNeed.id, `${prevMonth(prev)}-01`);
  await saveBudget(R, cur, null, { lines: { [food.id]: 10000 } });
  await createTransaction(R, { type: "expense", amount: 50000, date: today, categoryId: lux.id, restraint: true });
  await createTransaction(R, { type: "expense", amount: 15000, date: today, categoryId: food.id });

  let rv = await restraintView(R, cur);
  assert.deepEqual([rv.detail.luxury, rv.detail.overage.map((o) => [o.name, o.over]), rv.detail.carriedIn, rv.target], [50000, [["식비", 5000]], 0, 55000]);
  let pv = await restraintView(R, prev);
  assert.deepEqual([pv.closed, pv.entries.map((e) => [e.origin, e.name, e.amount])], [true, [["wish_auto", "무선 이어폰", 89000]]], "지난달 정산: 한 달 내내 안 산 갖고 싶음만 자동 포함(필요 제외)");
  assert.deepEqual(rv.candidates.map((c) => c.name), ["가죽 가방"], "이미 센 위시는 후보에서 빠짐");

  // 직접 기록 + 위시에서 고르기(한 번만)
  await createRestraint(R, { name: "한정판 운동화", amount: 20000, date: today, reason: "비슷한 게 있음" });
  await createRestraint(R, { name: "가죽 가방", amount: 30000, date: today, wishItemId: w2.id });
  assert.equal(await code(createRestraint(R, { name: "x", amount: 1, date: today, wishItemId: w2.id })), "DUPLICATE");
  rv = await restraintView(R, cur);
  assert.deepEqual([rv.filled, rv.candidates.length], [50000, 0]);

  // 그만둘 때 기록 → 달성
  const w3 = await createWish(R, { kind: "shopping", name: "향수", level: "want", price: 40000 });
  await dropWish(R, w3.id, w3.version, null, true);
  rv = await restraintView(R, cur);
  assert.equal(rv.filled, 90000);
  assert.equal((await wishList(R)).find((w) => w.id === w3.id)?.restrained?.month, cur, "위시에 ○월에 참음");

  // 참았던 위시를 삼 → 산 달 참아야 할 금액에 더함, 되돌리면 빠짐(D-041)
  const w1now = await wishRepo.get(R, w1.id);
  await purchaseWish(R, w1.id, w1now.version, { type: "expense", amount: 89000, date: today, categoryId: shopCat.id });
  rv = await restraintView(R, cur);
  assert.deepEqual([rv.target, rv.detail.laterBought], [55000 + 89000, 89000]);
  await reopenWish(R, w1.id, (await wishRepo.get(R, w1.id)).version, true);
  rv = await restraintView(R, cur);
  assert.equal(rv.target, 55000);

  // 지난달: 자동 항목 빼기 → 다시 정산 필요, 갚기 지출 추가 → 부족분이 이번 달로 넘어옴
  pv = await restraintView(R, prev);
  await setExcluded(R, pv.entries[0].id, pv.entries[0].version, true);
  await createTransaction(R, { type: "expense", amount: 100000, date: `${prev}-20`, categoryId: lux.id, restraint: true });
  pv = await restraintView(R, prev);
  assert.equal(pv.stale, true, "정산 뒤 바뀜");
  await resettle(R, prev);
  pv = await restraintView(R, prev);
  assert.deepEqual([pv.stale, pv.target, pv.filled, pv.carryOut], [false, 100000, 0, 100000]);
  rv = await restraintView(R, cur);
  assert.deepEqual([rv.detail.carriedIn, rv.target], [100000, 155000]);
  assert.deepEqual(rv.candidates.map((c) => c.name), ["무선 이어폰"], "뺀 위시는 다시 대상");
  assert.equal((await restraintView(B, cur)).entries.length, 0, "남의 기록은 안 보임");
  console.log("참은 소비 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [mediaLogs, mediaWorks, wishItems, transactions, finCategories, paymentMethods, budgets, plannedExpenses, restraintEntries, restraintMonths, revisions]) await db.delete(t).where(inArray(t.userId, users));
  process.exit(process.exitCode ?? 0);
}
