// 건강 기록 규칙(src/server/health.ts) 확인: node --env-file=.env scripts/check-health-db.mts (개발 DB)
// 값·메모는 DB에 암호화돼 있음, 범위 검증, 남의 기록 막기
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const { db } = await import("../src/db/index.ts");
const { healthRecords, revisions } = await import("../src/db/schema.ts");
const { AppError } = await import("../src/server/errors.ts");
const { createHealth, healthList, updateHealth } = await import("../src/server/health.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-hlt-a", actor: "user" };
const B: Ctx = { userId: "check-hlt-b", actor: "user" };
const users = [A.userId, B.userId];
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? (e.extra.fields?.[0]?.message ?? e.code) : String(e)));

try {
  const w = { kind: "weight", date: "2026-11-02", time: "07:30" } as const;
  assert.equal(await code(createHealth(A, { ...w, value: 19.9 })), "20~300 사이로 입력해 주세요");
  assert.equal(await code(createHealth(A, { kind: "glucose", date: "2026-11-02", time: "07:30", value: 98 })), "측정 시점을 골라 주세요");
  assert.equal(await code(createHealth(A, { kind: "glucose", date: "2026-11-02", time: "07:30", value: 98.5, context: "fasting" })), "20~600 사이 정수로 입력해 주세요");

  const r = await createHealth(A, { ...w, value: 52.34, memo: "아침 공복", context: "fasting" });
  const [raw] = await db.select().from(healthRecords).where(eq(healthRecords.id, r.id));
  assert.ok(raw.valueEnc.startsWith("v1.") && !raw.valueEnc.includes("52"), "값은 암호화돼 저장");
  assert.ok(raw.memoEnc?.startsWith("v1.") && !raw.memoEnc.includes("아침"), "메모도 암호화");
  assert.equal(raw.context, null, "체중엔 측정 시점 없음");
  const [rev] = await db.select().from(revisions).where(eq(revisions.entityId, r.id));
  assert.ok(!JSON.stringify(rev.after).includes("아침"), "변경 이력에도 평문이 없음");

  let list = await healthList(A, "weight", "2026-01-01");
  assert.deepEqual([list[0].value, list[0].memo], [52.3, "아침 공복"], "소수 1자리로 저장, 읽을 때 풀림");
  await updateHealth(A, r.id, r.version, { ...w, value: 52.1, memo: null });
  list = await healthList(A, "weight", "2026-01-01");
  assert.deepEqual([list[0].value, list[0].memo], [52.1, null]);
  assert.equal(await code(updateHealth(A, r.id, r.version, { ...w, value: 50 })), "VERSION_CONFLICT");
  assert.equal(await code(updateHealth(B, r.id, 2, { ...w, value: 50 })), "NOT_FOUND", "남의 기록 못 고침");
  assert.equal((await healthList(B, "weight", "2026-01-01")).length, 0);
  // 주사: 약 이름 필수, 약 이름·용량·부위도 암호화
  assert.equal(await code(createHealth(A, { kind: "injection", date: "2026-11-02", time: "08:00", injection: { name: " " } })), "약 이름을 입력해 주세요");
  const inj = await createHealth(A, { kind: "injection", date: "2026-11-02", time: "08:00", injection: { name: "인슐린", dose: "10단위", site: "배 왼쪽" } });
  const [rawInj] = await db.select().from(healthRecords).where(eq(healthRecords.id, inj.id));
  assert.ok(rawInj.valueEnc.startsWith("v1.") && !rawInj.valueEnc.includes("인슐린"), "주사 내용도 암호화");
  const injList = await healthList(A, "injection", "2026-01-01");
  assert.deepEqual(injList[0].injection, { name: "인슐린", dose: "10단위", site: "배 왼쪽" });
  console.log("건강 기록 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [healthRecords, revisions]) await db.delete(t).where(inArray(t.userId, users));
  process.exit(process.exitCode ?? 0);
}
