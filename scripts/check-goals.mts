// 목표·트래커 규칙(src/server/goals.ts) 확인: node --env-file=.env scripts/check-goals.mts (개발 DB)
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { goalCategories, goals, revisions, trackerCells, trackerItems, trackerMonthItems } from "../src/db/schema.ts";
import { GOAL_PALETTE } from "../src/lib/palette.ts";
import { AppError } from "../src/server/errors.ts";
import { addItem, createGoal, createPeriodGoal, goalCategoryList, periodGoals, removeFromMonth, setCell, setGoalStatus, startMonthWith, suggestColor, trackerMonth } from "../src/server/goals.ts";
import { periodKey } from "../src/server/calendar.ts";
import type { Ctx } from "../src/server/repo.ts";
import { todayIn } from "../src/server/time.ts";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const A: Ctx = { userId: "check-goal-a", actor: "user" };
const B: Ctx = { userId: "check-goal-b", actor: "user" };
const users = [A.userId, B.userId];
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? e.code : String(e)));
const today = todayIn();
const month = today.slice(0, 7);
const [y, m] = month.split("-").map(Number);
const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

try {
  // 색 기본값: 아직 안 쓴 팔레트 색 순서
  assert.equal(await suggestColor(A, month), GOAL_PALETTE[0].hex);
  const read = await addItem(A, month, { name: "독서", colorHex: GOAL_PALETTE[0].hex.toLowerCase() });
  assert.equal(read.colorHex, GOAL_PALETTE[0].hex, "색은 대문자 HEX로 저장");
  assert.equal(await suggestColor(A, month), GOAL_PALETTE[1].hex);
  assert.equal(await code(addItem(A, month, { name: "x", colorHex: "red" })), "VALIDATION_FAILED");

  // 칸: 미래 불가, 남의 항목 불가, 빈 칸은 지워짐, 마지막 쓰기 우선
  assert.equal(await code(setCell(A, { itemId: read.id, date: tomorrow, done: true })), "BUSINESS_RULE");
  assert.equal(await code(setCell(B, { itemId: read.id, date: today, done: true })), "NOT_FOUND");
  await setCell(A, { itemId: read.id, date: today, done: true, memo: "30분" });
  await setCell(A, { itemId: read.id, date: today, done: false, memo: "쉼" });
  let view = await trackerMonth(A, month);
  assert.deepEqual(view.cells.map((c) => [c.done, c.memo]), [[false, "쉼"]]);
  await setCell(A, { itemId: read.id, date: today, done: false, memo: "" });
  assert.equal((await trackerMonth(A, month)).cells.length, 0, "빈 칸은 행 없음");
  assert.equal(await code(setCell(A, { itemId: read.id, date: today, done: true, memo: "가".repeat(41) })), "VALIDATION_FAILED");

  // 지난달 항목으로 시작: 남의 항목은 무시
  const old = await addItem(A, prev, { name: "운동", colorHex: GOAL_PALETTE[3].hex });
  const others = await addItem(B, prev, { name: "남의 것", colorHex: GOAL_PALETTE[4].hex });
  await removeFromMonth(A, read.id, month);
  view = await trackerMonth(A, month);
  assert.equal(view.items.length, 0);
  assert.deepEqual(view.previous.map((i) => i.name), ["운동"]);
  await startMonthWith(A, month, [old.id, others.id]);
  assert.deepEqual((await trackerMonth(A, month)).items.map((i) => i.name), ["운동"]);

  // 목표: 기간 검사, 달성 처리
  assert.equal(await code(createGoal(A, { title: "자산 1억", horizon: "mid", startYear: 2029, endYear: 2027 })), "VALIDATION_FAILED");
  assert.equal(await code(createGoal(A, { title: "x", horizon: "short", startYear: 2027, endYear: null })), "VALIDATION_FAILED");
  const cats = await goalCategoryList(A);
  assert.ok(cats.some((c) => c.name === "독서"));
  assert.equal(await code(createGoal(B, { title: "x", horizon: "short", categoryId: cats[0].id })), "VALIDATION_FAILED", "남의 카테고리 불가");
  const g = await createGoal(A, { title: "책 24권 읽기", horizon: "short", startYear: 2027, endYear: 2027, categoryId: cats[0].id });
  const done = await setGoalStatus(A, g.id, g.version, "done");
  assert.equal(done.status, "done");
  assert.equal(done.achievedAt, today);
  assert.equal((await setGoalStatus(A, g.id, done.version, "active")).achievedAt, null);

  // 월·주·일 목표(D-072): 일정 메모와 같은 key로 묶임, 연 목표와 섞이지 않음
  const mk = periodKey("month", today);
  const mg = await createPeriodGoal(A, "month", mk, "이번 달 책 2권");
  assert.equal(mg.startYear, null, "기간 목표는 연도 비움");
  assert.deepEqual((await periodGoals(A, "month", mk)).map((x) => x.title), ["이번 달 책 2권"]);
  assert.equal((await periodGoals(B, "month", mk)).length, 0, "남의 목표는 안 보임");
  assert.equal((await periodGoals(A, "year", "2027")).some((x) => x.id === mg.id), false, "연 보기엔 연 목표만");
  assert.deepEqual((await periodGoals(A, "year", "2027")).map((x) => x.id), [g.id]);
  const mDone = await setGoalStatus(A, mg.id, mg.version, "done");
  assert.equal(mDone.achievedAt, today);
  assert.equal((await periodGoals(A, "month", mk))[0].status, "done");
  const wk = periodKey("week", today);
  await createPeriodGoal(A, "week", wk, "주 3회 운동");
  assert.equal((await periodGoals(A, "week", wk)).length, 1);
  assert.equal((await periodGoals(A, "day", today)).length, 0);
  assert.equal((await createPeriodGoal(A, "year", "2030", "올해 목표")).endYear, 2030);
  assert.equal(await code(createPeriodGoal(A, "week", today === wk ? tomorrow : today, "x")), "BAD_REQUEST", "주 key는 일요일");
  assert.equal(await code(createPeriodGoal(A, "month", "2026-13", "x")), "BAD_REQUEST");
  assert.equal(await code(createGoal(A, { title: "x", horizon: "short", startYear: 2027, endYear: 2027, periodScope: "month", periodKey: mk })), "VALIDATION_FAILED", "기간 목표에 연도 불가");
  console.log("목표·트래커 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [trackerCells, trackerMonthItems, trackerItems, goals, goalCategories, revisions]) await db.delete(t).where(inArray(t.userId, users));
  process.exit(process.exitCode ?? 0);
}
