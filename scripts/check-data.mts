// 공통 데이터 규칙(src/server/repo.ts·api.ts) 확인: node --env-file=.env scripts/check-data.mts
// 개발 DB에 시험용 테이블을 만들었다 지움. 확인: 사용자 격리, 버전 충돌, 변경 이력, 휴지통·묶음 복구, 멱등 키
import assert from "node:assert/strict";
import { and, eq, inArray, sql } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { db } from "../src/db/index.ts";
import { userData } from "../src/db/columns.ts";
import { idempotencyKeys, revisions } from "../src/db/schema.ts";
import { once } from "../src/server/idempotency.ts";
import { AppError } from "../src/server/errors.ts";
import { defineRepo, restore, type Ctx } from "../src/server/repo.ts";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");

const items = pgTable("zz_check_item", { ...userData(), name: text("name").notNull() });
await db.execute(sql`drop table if exists zz_check_item`);
await db.execute(sql`create table zz_check_item (
  id uuid primary key, user_id text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, deleted_by text, delete_batch_id uuid, version int not null default 1, source text not null default 'manual', name text not null)`);
const repo = defineRepo(items, "zz_check_item");
const A: Ctx = { userId: "check-a", actor: "user" };
const B: Ctx = { userId: "check-b", actor: "user" };
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? e.code : String(e)));

try {
  // 사용자 격리: 다른 사용자 것은 "없음"
  const x = await repo.create(A, { name: "첫 항목" });
  assert.equal(x.userId, "check-a");
  assert.equal(x.version, 1);
  assert.equal(await code(repo.get(B, x.id)), "NOT_FOUND");
  assert.equal((await repo.list(B)).length, 0);
  assert.equal(await code(repo.update(B, x.id, 1, { name: "남의 것" })), "NOT_FOUND");
  assert.equal(await code(repo.remove(B, x.id)), "NOT_FOUND");

  // 버전 충돌: 오래된 version이면 409 + 최신 값
  const y = await repo.update(A, x.id, 1, { name: "고침" });
  assert.equal(y.version, 2);
  const conflict = await repo.update(A, x.id, 1, { name: "옛 화면" }).catch((e) => e);
  assert.equal(conflict.code, "VERSION_CONFLICT");
  assert.equal((conflict.extra.data as { name: string }).name, "고침");
  assert.equal((await repo.update(A, x.id, 2, { name: "고침" })).version, 2, "바뀐 게 없으면 version 그대로");

  // 휴지통: 지우면 조회에서 빠지고 휴지통에, 복구하면 돌아옴
  await repo.remove(A, x.id);
  assert.equal(await code(repo.get(A, x.id)), "NOT_FOUND");
  assert.equal((await repo.trash(A)).length, 1);
  assert.equal(await code(restore(B, "zz_check_item", x.id)), "NOT_FOUND");
  assert.equal((await restore(A, "zz_check_item", x.id)).restored, 1);
  assert.equal((await repo.get(A, x.id)).name, "고침");

  // 묶음 삭제·복구: 같은 batch로 지운 것은 함께 돌아옴
  const p = await repo.create(A, { name: "부모" });
  const c = await repo.create(A, { name: "자식" });
  await db.transaction(async (tx) => {
    const r = await repo.remove(A, p.id, { tx });
    await repo.remove(A, c.id, { tx, batchId: r.deleteBatchId! });
  });
  assert.equal((await repo.list(A)).length, 1);
  assert.equal((await restore(A, "zz_check_item", c.id)).restored, 2);
  assert.equal((await repo.list(A)).length, 3);

  // 변경 이력: create·update·delete·restore가 남고, update는 바뀐 필드만
  const hist = await db.select().from(revisions).where(and(eq(revisions.userId, "check-a"), eq(revisions.entityId, x.id)));
  assert.deepEqual(hist.map((h) => h.action).sort(), ["create", "delete", "restore", "update"]);
  const upd = hist.find((h) => h.action === "update")!;
  assert.deepEqual(upd.changedFields, ["name"]);
  assert.deepEqual([upd.before, upd.after], [{ name: "첫 항목" }, { name: "고침" }]);

  // 멱등 키: 같은 키는 한 번만 실행, 같은 키에 다른 요청은 거절
  let runs = 0;
  const run = async () => ({ status: 201, body: { data: { n: ++runs } } });
  const first = await once("check-a", "k1", "POST /x {a}", run);
  const again = await once("check-a", "k1", "POST /x {a}", run);
  assert.equal(runs, 1);
  assert.deepEqual(again, first);
  assert.equal(await code(once("check-a", "k1", "POST /x {b}", run)), "IDEMPOTENCY_MISMATCH");
  await once("check-b", "k1", "POST /x {a}", run);
  assert.equal(runs, 2, "키는 사용자마다 따로");

  console.log("공통 데이터 규칙 확인 통과");
} finally {
  await db.execute(sql`drop table if exists zz_check_item`);
  await db.delete(revisions).where(inArray(revisions.userId, ["check-a", "check-b"]));
  await db.delete(idempotencyKeys).where(inArray(idempotencyKeys.userId, ["check-a", "check-b"]));
  process.exit(process.exitCode ?? 0);
}
