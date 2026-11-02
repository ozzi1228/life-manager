// 운영 상태(설정 > 운영, 주인만): 마지막 백업·예약 작업 결과, 하트비트 연결 여부 (16 §12)
// 백업은 PC 작업 스케줄러가 scripts/backup.ps1로 하고 결과를 job_runs(key backup:날짜)에 남김
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { jobRuns } from "../db/schema.ts";
import type { Ctx } from "./repo.ts";

/** 주인(.env OONA_OWNER_USERNAME)만. 주인을 정하지 않았으면(혼자 쓰는 개발) 모두 */
export async function isOwnerCtx(ctx: Ctx) {
  const owner = process.env.OONA_OWNER_USERNAME;
  if (!owner) return true;
  const r = await db.execute<{ username: string | null }>(sql`select username from "user" where id = ${ctx.userId}`);
  return r.rows[0]?.username === owner;
}

const JOBS = [
  { job: "backup", label: "백업" },
  { job: "trash.retention", label: "휴지통 정리" },
  { job: "logs.archive", label: "로그 보관" },
  { job: "restraint.settle", label: "참은 소비 정산" },
];

export async function opsStatus(ctx: Ctx) {
  if (!(await isOwnerCtx(ctx))) return null;
  const jobs = await Promise.all(
    JOBS.map(async ({ job, label }) => {
      const [last] = await db.select().from(jobRuns).where(eq(jobRuns.job, job)).orderBy(desc(jobRuns.startedAt)).limit(1);
      return { job, label, status: last?.status ?? null, at: (last?.finishedAt ?? last?.startedAt)?.toISOString() ?? null, error: last?.error ?? null, detail: last?.detail ?? null };
    }),
  );
  return { jobs, heartbeat: !!process.env.HEARTBEAT_URL };
}
export type OpsStatus = NonNullable<Awaited<ReturnType<typeof opsStatus>>>;
