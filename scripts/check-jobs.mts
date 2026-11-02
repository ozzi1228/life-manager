// 예약 작업 규칙(src/server/jobs.ts) 확인: node --env-file=.env scripts/check-jobs.mts (개발 DB, 로그 파일은 임시 폴더)
// 같은 key는 한 번만, 실패하면 다음에 다시, 오래 멈춘 "도는 중"도 다시, API 로그 30일 지난 것 → 날짜별 압축 파일
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { eq, inArray, like } from "drizzle-orm";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const dir = mkdtempSync(join(tmpdir(), "oona-files-"));
process.env.OONA_FILES_DIR = dir;

const { db } = await import("../src/db/index.ts");
const { apiLogs, jobRuns } = await import("../src/db/schema.ts");
const { once } = await import("../src/server/jobs.ts");

const K = "check-job";
try {
  let n = 0;
  assert.equal(await once(`${K}:a`, K, async () => ++n), 1);
  assert.equal(await once(`${K}:a`, K, async () => ++n), null, "성공한 key는 다시 안 함");
  assert.equal(n, 1);

  assert.equal(await once(`${K}:b`, K, async () => { throw new Error("boom"); }), null);
  const [failed] = await db.select().from(jobRuns).where(eq(jobRuns.key, `${K}:b`));
  assert.deepEqual([failed.status, failed.error], ["failed", "boom"]);
  assert.equal(await once(`${K}:b`, K, async () => "retried"), "retried", "실패한 key는 다음에 다시");

  // 서버가 중간에 꺼져 "도는 중"으로 남은 key: 1시간 안이면 건너뛰고, 넘으면 다시
  await db.insert(jobRuns).values({ key: `${K}:c`, job: K, status: "running" });
  assert.equal(await once(`${K}:c`, K, async () => "x"), null);
  await db.update(jobRuns).set({ startedAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(jobRuns.key, `${K}:c`));
  assert.equal(await once(`${K}:c`, K, async () => "x"), "x");

  // API 로그 보관: 30일 지난 행 → files/logs/api/YYYY/MM/날짜.jsonl.gz, DB에서 지움
  const old = new Date("2026-09-01T03:00:00Z");
  await db.insert(apiLogs).values([
    { requestId: `${K}-1`, method: "GET", route: "/x", status: 200, ms: 5, createdAt: old },
    { requestId: `${K}-2`, method: "POST", route: "/y", status: 500, ms: 9, createdAt: old },
    { requestId: `${K}-3`, method: "GET", route: "/z", status: 200, ms: 1 },
  ]);
  const jobs = await import("../src/server/jobs.ts");
  await db.delete(jobRuns).where(like(jobRuns.key, "logs:%"));
  await jobs.tick().catch(() => {}); // 오늘 key의 로그 작업 포함(다른 작업도 함께 돎)
  const file = join(dir, "logs", "api", "2026", "09", "2026-09-01.jsonl.gz");
  const lines = gunzipSync(readFileSync(file)).toString().trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.requestId === `${K}-2` && l.status === 500), "압축 파일에 옮김");
  const left = await db.select().from(apiLogs).where(inArray(apiLogs.requestId, [`${K}-1`, `${K}-2`, `${K}-3`]));
  assert.deepEqual(left.map((r) => r.requestId), [`${K}-3`], "옮긴 행은 지우고 최근 것은 남김");
  console.log("예약 작업 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.delete(jobRuns).where(like(jobRuns.key, `${K}%`));
  await db.delete(apiLogs).where(like(apiLogs.requestId, `${K}%`));
  rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
