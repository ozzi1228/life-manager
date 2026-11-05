// 지출 규칙(src/server/finance.ts) 확인: node --env-file=.env scripts/check-finance.mts (개발 DB)
// 기본 분류 생성, 금액 검증, 남의 분류 사용 막기, 환불 차감, 달 경계
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { accounts, budgets, cards, finCategories, paymentMethods, pays, plannedExpenses, recurringPayments, revisions, transactions } from "../src/db/schema.ts";
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
  const salary = fa.categories.find((c) => c.name === "급여")!;
  assert.ok(food && salary, "기본 분류가 만들어짐");
  assert.ok(!fa.categories.some((c) => c.name === "사치"), "사치 분류는 만들지 않음(지출마다 체크)");
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
  const lux = await createTransaction(A, { ...base, amount: 50000, restraint: true });
  assert.equal(lux.restraint, true, "갚기 체크한 지출은 참은 소비 안내");
  assert.equal((await createTransaction(A, { type: "income", amount: 1, date: "2026-10-01", categoryId: salary.id, restraint: true })).restraint, false, "수입은 갚기 안 됨");
  await createTransaction(A, { ...base, amount: 2000, isRefund: true });
  await createTransaction(A, { type: "income", amount: 100000, date: "2026-11-30", categoryId: salary.id });
  await createTransaction(A, { ...base, date: "2026-12-01", amount: 999 });
  const nov = await monthTransactions(A, "2026-11");
  assert.equal(nov.length, 4, "12월 1일은 11월에 안 들어감");
  assert.deepEqual(totals(nov), { expense: 12000 + 50000 - 2000, income: 100000 });
  assert.equal((await monthTransactions(B, "2026-11")).length, 0);
  console.log("지출 규칙 확인 통과");

  // 태그·검색·필터·통계(SCR-FIN-02)
  const { readFilter, txStats } = await import("../src/lib/tx-search.ts");
  const { searchTransactions, tagList } = await import("../src/server/finance.ts");
  const jeju = await createTransaction(A, { ...base, date: "2026-10-20", amount: 30000, title: "흑돼지 100%", memo: "제주 둘째 날", tags: ["#여행-제주", " 데이트 ", "여행-제주", ""] });
  assert.deepEqual(jeju.row.tags, ["여행-제주", "데이트"], "태그 정리: # 빼고, 공백 정리, 같은 건 하나");
  await createTransaction(A, { ...base, date: "2026-10-21", amount: 8000, title: "공항 김밥", tags: ["여행-제주"] });
  assert.deepEqual((await tagList(A)).slice(0, 2), ["여행-제주", "데이트"], "많이 쓴 태그 먼저");
  const now = "2026-11-04";
  const find = (sp: Record<string, string | string[]>) => searchTransactions(A, readFilter(sp, now));
  assert.equal((await find({})).length, 4, "기본은 이번 달");
  assert.equal((await find({ period: "all", tag: "여행-제주" })).length, 2, "태그로 전체 기간");
  assert.equal((await find({ period: "all", q: "제주" })).length, 2, "검색: 메모·태그");
  assert.equal((await find({ period: "all", q: "100%" })).length, 1, "검색어의 %는 글자 그대로");
  assert.equal((await find({ period: "all", q: "식비" })).length, 6, "검색: 분류 이름");
  assert.equal((await find({ period: "all", q: "제주" }).then((r) => r.length)) + (await searchTransactions(B, readFilter({ period: "all", q: "제주" }, now))).length, 2, "남의 것은 안 보임");
  assert.equal((await find({ type: "refund" })).length, 4, "환불 보기는 없앰(모두와 같음)");
  assert.equal((await find({ type: "expense" })).length, 2, "지출 = 환불 뺀 지출");
  assert.equal((await find({ restraint: "1" })).length, 1);
  assert.equal((await find({ period: "all", min: "10000", max: "40000" })).length, 2, "금액 범위");
  assert.equal((await find({ period: "range", from: "2026-10-21", to: "2026-10-01" })).length, 3, "거꾸로 고른 기간도");
  assert.equal(readFilter({ cat: ["x", food.id] }, now).cats.length, 1, "잘못된 id는 버림");

  const s = txStats(await find({}), "2026-11-01", "2026-11-30");
  assert.deepEqual([s.kind, s.total, s.income, s.refund, s.restraint, s.count], ["expense", 60000, 100000, 2000, 50000, 4]);
  assert.equal(s.avg, 30000, "평균 = 합계(환불 차감) / 환불 아닌 지출 건수");
  assert.equal(s.top[0].amount, 50000);
  assert.deepEqual(s.byCategory, [{ key: food.id, amount: 60000, count: 2 }]);
  assert.equal(s.trend.unit, "day");
  assert.equal(s.trend.points.length, 30, "빈 날도 채움");
  assert.equal(s.trend.points[0].amount, 60000);
  const st = txStats(await find({ period: "all", tag: "여행-제주" }));
  assert.deepEqual(st.byTag.map((p) => [p.key, p.amount]), [["여행-제주", 38000], ["데이트", 30000]], "태그별 합계");
  assert.equal(txStats(await find({ period: "year" }), "2026-01-01", "2026-12-31").trend.unit, "month");
  assert.equal(txStats(await find({ type: "income" })).kind, "income");
  console.log("검색·필터·통계 확인 통과");

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

  // 카드: 지출 입력에서 만든 카드도 목록에, 메모, 남의 카드 불가, 같은 이름 불가, 지우면 목록에서 빠지고 되돌리기 가능(D-071: 혜택 계산 없음)
  const { createCard, cardList, updateCard, removePaymentMethod } = await import("../src/server/cards.ts");
  const { createPaymentMethod } = await import("../src/server/finance.ts");
  const quick = await createPaymentMethod(A, { kind: "card", name: "빠른카드" });
  const pmA = await createCard(A, { name: "A카드", issuer: "우나카드", cardType: "credit", billingDay: 14, memo: "- 편의점 갈 때 최대 혜택" });
  assert.deepEqual((await cardList(A)).map((c) => c.name).sort(), ["A카드", "빠른카드"], "지출 입력에서 만든 카드도 나옴");
  assert.equal((await cardList(A)).find((c) => c.id === pmA.id)?.card?.memo, "- 편의점 갈 때 최대 혜택");
  assert.equal((await cardList(B)).length, 0, "남의 카드 안 보임");
  assert.equal(await code(updateCard(B, pmA.id, 1, { name: "x" })), "NOT_FOUND", "남의 카드 못 고침");
  assert.equal(await code(updateCard(A, pmA.id, 1, { name: "빠른카드" })), "DUPLICATE", "같은 이름 카드 불가");
  const renamed = await updateCard(A, quick.id, quick.version, { name: "B카드", billingDay: 1, memo: "주유" });
  assert.deepEqual([renamed.billingDay, renamed.memo], [1, "주유"], "설정이 없던 카드도 고치면 생김");
  await removePaymentMethod(A, "card", quick.id);
  assert.deepEqual((await cardList(A)).map((c) => c.name), ["A카드"], "지운 카드는 목록에서 빠짐");
  assert.ok(!(await formData(A)).paymentMethods.some((p) => p.id === quick.id), "지운 카드는 입력 창에도 없음");
  await restore(A, "payment_method", quick.id);
  assert.equal((await cardList(A)).find((c) => c.id === quick.id)?.card?.memo, "주유", "되돌리면 카드 설정도 함께 돌아옴");
  await removePaymentMethod(A, "card", quick.id);
  console.log("카드 규칙 확인 통과");

  // 페이·계좌: 결제수단은 실제로 돈이 나간 곳, 페이는 pay_id로 따로 → 카드 합계 한 번만, 페이로 찾으면 다 나옴
  const { createPay, payList, createAccount, updateAccount, accountList } = await import("../src/server/cards.ts");
  const bank = await createAccount(A, { name: "월급 통장", category: "checking", bank: "국민", balance: 500000, rate: 3 });
  assert.equal((await accountList(A))[0].account?.rate, null, "입출금은 이율 칸을 비움");
  await updateCard(A, pmA.id, (await cardList(A))[0].pmVersion, { name: "A카드", linkedAccountId: bank.id });
  assert.equal(await code(updateCard(A, pmA.id, 99, { name: "A카드", linkedAccountId: food.id })), "VALIDATION_FAILED", "결제 계좌는 내 계좌만");
  const npay = await createPay(A, { name: "네이버페이", sourceIds: [pmA.id, bank.id] });
  assert.equal(await code(createPay(B, { name: "x", sourceIds: [pmA.id] })), "VALIDATION_FAILED", "남의 카드 연결 불가");
  assert.deepEqual((await payList(A))[0].sourceIds, [pmA.id, bank.id]);
  const day = todayIn();
  await createTransaction(A, { ...base, date: day, amount: 7000, paymentMethodId: pmA.id, payId: npay.id });
  await createTransaction(A, { ...base, date: day, amount: 3000, paymentMethodId: pmA.id });
  await createTransaction(A, { ...base, date: day, amount: 1500, paymentMethodId: npay.id, payId: npay.id }); // 페이 머니
  assert.equal(await code(createTransaction(A, { ...base, amount: 1, paymentMethodId: pmA.id, payId: pmA.id })), "VALIDATION_FAILED", "페이 칸엔 페이만");
  assert.equal((await formData(A)).pays[npay.id].last, npay.id, "페이마다 마지막으로 고른 곳");
  const viaPay = await searchTransactions(A, readFilter({ period: "all", pm: npay.id }, day));
  assert.equal(viaPay.length, 2, "페이로 찾으면 연결 카드·페이 머니 결제 모두");
  const acc = (await accountList(A)).find((a) => a.id === bank.id)!;
  assert.deepEqual(acc.cards, [{ id: pmA.id, name: "A카드", monthSpent: 10000 }], "카드 사용액은 페이 거친 것까지 한 번씩");
  await createRecurring(A, { name: "넷플릭스", amount: 13500, cycle: "monthly", dayOfMonth: 5, startedAt: "2026-01-01", paymentMethodId: pmA.id });
  await createRecurring(A, { name: "관리비", amount: 100000, cycle: "monthly", dayOfMonth: 25, startedAt: "2026-01-01", paymentMethodId: bank.id });
  assert.deepEqual((await accountList(A))[0].autopays.map((r) => [r.name, r.via]).sort(), [["관리비", null], ["넷플릭스", "A카드"]], "자동 결제: 계좌에서 바로 + 연결 카드로");
  const dep = await createAccount(A, { name: "정기예금", category: "deposit", principal: 10000000, rate: 3.5, startDate: "2026-01-01", maturityDate: "2027-01-01", balance: 1 });
  const depRow = (await accountList(A)).find((a) => a.id === dep.id)!.account!;
  assert.deepEqual([depRow.balance, depRow.tax], [null, "normal"], "예금은 잔액 칸 비우고 과세 기본 일반");
  assert.equal(await code(updateAccount(A, dep.id, 1, { name: "정기예금", category: "deposit", startDate: "2027-01-01", maturityDate: "2026-01-01" })), "VALIDATION_FAILED", "만기일은 시작일 뒤");
  const cad = await createAccount(A, { name: "캐나다 통장", category: "checking", currency: "CAD", balance: 123456 });
  assert.deepEqual(((await accountList(A)).find((a) => a.id === cad.id)!.account!).currency, "CAD", "계좌 통화(잔액은 센트 단위 그대로)");
  assert.equal(await code(createAccount(A, { name: "이상한 통화", currency: "XYZ" })), "VALIDATION_FAILED");
  console.log("페이·계좌 규칙 확인 통과");

  // 다른 통화 지출: amount는 원(합계·예산은 그대로), 원래 금액은 foreign_amount. 마지막 환율을 입력 창에 줌
  const fx = { type: "expense", date: "2024-06-10", categoryId: food.id };
  const ny = await createTransaction(A, { ...fx, amount: 17250, currency: "USD", foreignAmount: 1250, title: "뉴욕 커피" });
  assert.deepEqual([ny.row.amount, ny.row.currency, ny.row.foreignAmount], [17250, "USD", 1250]);
  assert.equal(await code(createTransaction(A, { ...fx, amount: 17250, currency: "USD" })), "VALIDATION_FAILED", "외화인데 원래 금액이 없으면 안 됨");
  assert.equal(await code(createTransaction(A, { ...fx, amount: 17250, currency: "USD", foreignAmount: 12.5 })), "VALIDATION_FAILED", "원래 금액도 가장 작은 단위 정수");
  const won = await createTransaction(A, { ...fx, amount: 5000, foreignAmount: 999 });
  assert.deepEqual([won.row.currency, won.row.foreignAmount], ["KRW", null], "원이면 원래 금액은 비움");
  await createTransaction(A, { ...fx, date: "2024-06-01", amount: 9000, currency: "JPY", foreignAmount: 1000 });
  await createTransaction(A, { ...fx, date: "2024-06-12", amount: 9300, currency: "JPY", foreignAmount: 1000 });
  const { lastRates } = await import("../src/server/finance.ts");
  assert.deepEqual(await lastRates(A), { USD: 1380, JPY: 9.3 }, "통화마다 가장 최근에 저장한 환율");
  assert.equal(totals(await monthTransactions(A, "2024-06")).expense, 17250 + 5000 + 9000 + 9300, "합계는 원으로");
  // 고정 지출·큰 지출·분류 예산도 같은 방식(amount는 원, 원래 금액 따로)
  const gpt = await createRecurring(A, { name: "ChatGPT", amount: 27600, currency: "USD", foreignAmount: 2000, cycle: "monthly", dayOfMonth: 3, startedAt: "2024-01-01" });
  assert.deepEqual([gpt.amount, gpt.currency, gpt.foreignAmount], [27600, "USD", 2000]);
  assert.equal(await code(createRecurring(A, { name: "x", amount: 1000, currency: "CAD", cycle: "monthly", dayOfMonth: 1, startedAt: "2024-01-01" })), "VALIDATION_FAILED", "고정 지출도 외화면 원래 금액 필요");
  assert.equal((await lastRates(A)).USD, 1380, "고정 지출 환율도 마지막 환율 후보(최근 저장 순)");
  await saveBudget(A, "2024-06", null, {
    lines: { [food.id]: 690000 },
    foreignLines: { [food.id]: { currency: "USD", amount: 50000 } },
    planned: [{ name: "뉴욕 여행", amount: 2760000, currency: "USD", foreignAmount: 200000 }, { name: "국내", amount: 100000, currency: "KRW", foreignAmount: 5 }],
  });
  const bv = await budgetView(A, "2024-06");
  assert.deepEqual(bv.budget?.foreignLines, { [food.id]: { currency: "USD", amount: 50000 } });
  assert.deepEqual(bv.planned.map((p) => [p.name, p.amount, p.currency, p.foreignAmount]), [["뉴욕 여행", 2760000, "USD", 200000], ["국내", 100000, "KRW", null]], "원이면 원래 금액 비움");
  assert.equal(bv.summary.total, bv.summary.fixed + 2760000 + 100000 + 690000, "예산 합계는 원으로");
  console.log("다른 통화 확인 통과");

  // 카드 정보: 암호화해 저장, 목록엔 뒤 4자리만, 보기는 revealCard로
  const { revealCard, cardList: cl, updateCard: uc } = await import("../src/server/cards.ts");
  const sc = await createCard(A, { name: "비밀카드", annualFee: 9900, currency: "USD", secret: { number: "1234-5678-9012-3456", expiry: "12/28", cvc: "123" } });
  const [raw] = await db.select().from(cards).where(eq(cards.paymentMethodId, sc.id));
  assert.ok(raw.secret && !raw.secret.includes("3456") && !raw.secret.includes("12/28"), "DB에는 암호문만");
  const item = (await cl(A)).find((c) => c.id === sc.id)!;
  assert.deepEqual([item.card?.last4, item.card?.hasSecret, item.card?.currency, "secret" in item.card!], ["3456", true, "USD", false], "목록엔 뒤 4자리만");
  assert.deepEqual(await revealCard(A, sc.id), { number: "1234567890123456", expiry: "12/28", cvc: "123" });
  assert.equal(await revealCard(B, sc.id), null, "남의 카드는 못 봄");
  await uc(A, sc.id, 1, { name: "비밀카드", memo: "메모만 고침" });
  assert.equal((await revealCard(A, sc.id))?.cvc, "123", "secret 없이 고치면 그대로");
  assert.equal(await code(uc(A, sc.id, 1, { name: "비밀카드", secret: { number: "12", expiry: "", cvc: "" } })), "VALIDATION_FAILED");
  assert.equal(await code(uc(A, sc.id, 1, { name: "비밀카드", secret: { number: "", expiry: "13/28", cvc: "" } })), "VALIDATION_FAILED", "유효기간 MM/YY");
  await uc(A, sc.id, 1, { name: "비밀카드", secret: { number: "", expiry: "", cvc: "" } });
  assert.equal(await revealCard(A, sc.id), null, "다 비우면 지움");
  assert.equal((await cl(A)).find((c) => c.id === sc.id)!.card?.last4, null);
  const tm = await createCard(A, { name: "티머니", cardType: "transit" });
  assert.equal((await cl(A)).find((c) => c.id === tm.id)?.card?.cardType, "transit", "교통카드 종류");
  console.log("카드 정보 확인 통과");

  // 고정 수입: 수입 분류만, 예산(고정 지출 합계)·결제 알림 대상에서 빠짐, 예정에는 type으로 구분
  const inc = (await formData(A)).categories.find((c) => c.kind === "income")!;
  const paydayMonth = "2027-03";
  assert.equal(await code(createRecurring(A, { type: "income", name: "월급", amount: 3000000, cycle: "monthly", dayOfMonth: 25, startedAt: "2027-01-01", categoryId: food.id })), "VALIDATION_FAILED", "고정 수입에 지출 분류는 못 씀");
  const pay = await createRecurring(A, { type: "income", name: "월급", amount: 3000000, cycle: "monthly", dayOfMonth: 25, startedAt: "2027-01-01", categoryId: inc.id });
  await createRecurring(A, { name: "보험", amount: 50000, cycle: "monthly", dayOfMonth: 10, startedAt: "2027-01-01" });
  assert.equal((await recurringList(A)).find((r) => r.id === pay.id)?.type, "income");
  const bv2 = await budgetView(A, paydayMonth);
  assert.equal(bv2.fixed.some((f) => f.name === "월급"), false, "예산의 고정 지출 합계에 고정 수입은 안 들어감");
  assert.ok(bv2.fixed.some((f) => f.name === "보험"));

  // 통계: 모두 보기(지출 기준)에도 수입 흐름·수입 분류별
  const mix = txStats([
    { type: "expense", amount: 10000, isRefund: false, restraint: false, date: "2026-11-01", categoryId: food.id, paymentMethodId: null, tags: [] },
    { type: "income", amount: 50000, isRefund: false, restraint: false, date: "2026-11-02", categoryId: inc.id, paymentMethodId: null, tags: [] },
  ], "2026-11-01", "2026-11-03");
  assert.deepEqual([mix.kind, mix.total, mix.income], ["expense", 10000, 50000]);
  assert.deepEqual(mix.trend.points.map((p) => [p.amount, p.income]), [[10000, 0], [0, 50000], [0, 0]]);
  assert.deepEqual(mix.incomeByCategory, [{ key: inc.id, amount: 50000, count: 1 }]);
  console.log("고정 수입·통계 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.delete(transactions).where(inArray(transactions.userId, users));
  await db.delete(recurringPayments).where(inArray(recurringPayments.userId, users));
  await db.delete(budgets).where(inArray(budgets.userId, users));
  await db.delete(cards).where(inArray(cards.userId, users));
  await db.delete(pays).where(inArray(pays.userId, users));
  await db.delete(accounts).where(inArray(accounts.userId, users));
  await db.delete(plannedExpenses).where(inArray(plannedExpenses.userId, users));
  await db.delete(finCategories).where(inArray(finCategories.userId, users));
  await db.delete(paymentMethods).where(inArray(paymentMethods.userId, users));
  await db.delete(revisions).where(inArray(revisions.userId, users));
  process.exit(process.exitCode ?? 0);
}
