// 예약 작업 (16 §5.5·§6·§12, 17 M-21): 앱 서버 안에서 5분마다 돌며 "아직 안 한 일"만 함 → PC가 꺼져 있었어도 켜지면 따라잡음
// 한 번만 해야 하는 단위마다 job_runs.key(예: trash:2026-11-02) — 이미 성공한 key는 건너뜀, 실패한 key는 다음 차례에 다시
// - 매일: 휴지통 90일 정리, API 로그 30일 넘은 것 → 날짜별 압축 파일, 작업 기록 90일 정리
// - 매일 9시 뒤: 내일 결제 예정 알림 / 수시: 예산 80%·초과 알림(그달 한 번씩)
// - 매달 1일 뒤: 참은 소비 지난달 정산 + 결과 알림
// - 5분마다: 하트비트(HEARTBEAT_URL이 있을 때, 16 §5.4)
// ponytail: 서버 하나(PC 한 대)라 잠금 없이 setInterval. 서버를 여러 개 띄우게 되면 key 고유 제약이 중복을 막아 줌
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { apiLogs, idempotencyKeys, jobRuns, restraintMonths } from "../db/schema.ts";
import { budgetView, prevMonth } from "./budget.ts";
import { pushUsers, sendPush } from "./push.ts";
import { upcoming } from "./recurring.ts";
import type { Ctx } from "./repo.ts";
import { catchUp } from "./restraint.ts";
import { todayIn } from "./time.ts";
import { trashView } from "./trash.ts";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const kstHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }));
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** key 단위로 한 번만 실행. 이미 성공했거나 다른 곳에서 도는 중이면 null */
export async function once<T>(key: string, job: string, fn: () => Promise<T>): Promise<T | null> {
  const [claimed] = await db
    .insert(jobRuns)
    .values({ key, job, status: "running" })
    .onConflictDoUpdate({
      target: jobRuns.key,
      set: { status: "running", startedAt: new Date(), error: null, finishedAt: null },
      // 실패했거나 1시간 넘게 "도는 중"(서버가 중간에 꺼짐)이면 다시
      setWhere: sql`${jobRuns.status} = 'failed' or (${jobRuns.status} = 'running' and ${jobRuns.startedAt} < now() - interval '1 hour')`,
    })
    .returning({ id: jobRuns.id });
  if (!claimed) return null;
  try {
    const out = await fn();
    await db.update(jobRuns).set({ status: "ok", detail: (out ?? null) as object, finishedAt: new Date() }).where(eq(jobRuns.id, claimed.id));
    return out;
  } catch (e) {
    console.error(`job ${key}`, e);
    await db.update(jobRuns).set({ status: "failed", error: String((e as Error)?.message ?? e).slice(0, 500), finishedAt: new Date() }).where(eq(jobRuns.id, claimed.id));
    return null;
  }
}

async function users() {
  const r = await db.execute<{ id: string }>(sql`select id from "user"`);
  return r.rows.map((u) => ({ userId: u.id, actor: "job" }) as Ctx);
}

// ── 작업들 ──

/** 휴지통: 보존 기간 지난 묶음 영구 삭제(휴지통 화면이 열 때 하는 정리와 같은 함수) */
async function trashRetention() {
  const all = await users();
  for (const ctx of all) await trashView(ctx);
  return { users: all.length };
}

/** API 로그: 30일 지난 것을 날짜별 압축 파일(files/logs/api/YYYY/MM/YYYY-MM-DD.jsonl.gz)로 옮기고 DB에서 지움. 작업 기록 90일·멱등 키 2일 정리 */
async function archiveLogs() {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db.select().from(apiLogs).where(lt(apiLogs.createdAt, cutoff)).limit(100_000);
  const root = process.env.OONA_FILES_DIR;
  if (rows.length && root) {
    const byDay = new Map<string, typeof rows>();
    for (const r of rows) {
      const d = r.createdAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
      byDay.set(d, [...(byDay.get(d) ?? []), r]);
    }
    for (const [d, list] of byDay) {
      const dir = join(root, "logs", "api", d.slice(0, 4), d.slice(5, 7));
      await mkdir(dir, { recursive: true });
      // gzip은 이어 붙여도 하나의 파일로 읽힘(zcat) — 같은 날을 두 번 옮겨도 안전
      await appendFile(join(dir, `${d}.jsonl.gz`), await promisify(gzip)(list.map((r) => JSON.stringify(r)).join("\n") + "\n"));
    }
    await db.delete(apiLogs).where(lt(apiLogs.createdAt, cutoff));
  }
  await db.delete(jobRuns).where(lt(jobRuns.startedAt, new Date(Date.now() - 90 * 86_400_000)));
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, new Date(Date.now() - 2 * 86_400_000)));
  return { archived: root ? rows.length : 0 };
}

/** 내일 결제 예정 알림(04 §8.4 결제 예정 하루 전). 사용자마다 한 번 */
async function paymentAlerts(today: string) {
  const tomorrow = addDay(today, 1);
  const subscribed = await pushUsers();
  let sent = 0;
  for (const ctx of (await users()).filter((u) => subscribed.has(u.userId))) {
    const due = (await upcoming(ctx)).filter((u) => u.date === tomorrow);
    if (!due.length) continue;
    const body = due.map((u) => `${u.name} ${u.variableAmount ? "약 " : ""}${won(u.amount)}`).join(", ");
    sent += (await once(`notify:payment:${ctx.userId}:${tomorrow}`, "notify.payment", () => sendPush(ctx.userId, "payment", { title: "내일 결제 예정", body, url: "/money/fixed" }))) ?? 0;
  }
  return { sent };
}

/** 이번 달 예산 80%·초과 알림 — 그달 상태마다 한 번 */
async function budgetAlerts(month: string) {
  const subscribed = await pushUsers();
  for (const ctx of (await users()).filter((u) => subscribed.has(u.userId))) {
    const v = await budgetView(ctx, month);
    if (!v.budget && !v.planned.length) continue;
    const s = v.summary;
    if (s.status === "ok") continue;
    const msg =
      s.status === "over"
        ? { title: "이번 달 예산을 넘었어요", body: `${won(s.spent)} / ${won(s.total)} · ${won(-s.left)} 초과`, url: "/money/budget" }
        : { title: "이번 달 예산의 80%를 썼어요", body: `남은 예산 ${won(s.left)}`, url: "/money/budget" };
    await once(`notify:budget:${ctx.userId}:${month}:${s.status}`, "notify.budget", () => sendPush(ctx.userId, "budget", msg));
  }
}

/** 참은 소비 지난달 정산(밀린 달까지) + 결과 알림 */
async function restraintSettle(month: string) {
  const last = prevMonth(month);
  for (const ctx of await users()) {
    await catchUp(ctx);
    const [row] = await db
      .select()
      .from(restraintMonths)
      .where(and(eq(restraintMonths.userId, ctx.userId), eq(restraintMonths.month, last)));
    if (!row || row.target <= 0 || !(await pushUsers()).has(ctx.userId)) continue;
    const m = Number(last.slice(5));
    const body = row.carryOut > 0 ? `참아야 할 ${won(row.target)} 중 ${won(row.filled)}을 참았어요. ${won(row.carryOut)}은 다음 달로 넘어가요` : `참아야 할 ${won(row.target)} 중 ${won(row.filled)}을 참았어요`;
    await once(`notify:restraint:${ctx.userId}:${last}`, "notify.restraint", () => sendPush(ctx.userId, "restraint", { title: `${m}월 정산이 끝났어요`, body, url: `/money/restraint?month=${last}` }));
  }
}

async function heartbeat() {
  const url = process.env.HEARTBEAT_URL;
  if (!url) return;
  await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch((e) => console.error("heartbeat", e?.message ?? e));
}

/** 한 번 돌기: 해야 할 일 중 아직 안 한 것만 */
export async function tick() {
  const today = todayIn();
  const month = today.slice(0, 7);
  await heartbeat();
  await once(`trash:${today}`, "trash.retention", trashRetention);
  await once(`logs:${today}`, "logs.archive", archiveLogs);
  await once(`restraint:${month}`, "restraint.settle", () => restraintSettle(month).then(() => ({ month })));
  if (kstHour() >= 9) await once(`payment-alerts:${today}`, "notify.payment.day", () => paymentAlerts(today));
  await budgetAlerts(month);
}

let started = false;
export function startScheduler(everyMs = 5 * 60_000) {
  if (started) return;
  started = true;
  const run = () => tick().catch((e) => console.error("scheduler", e));
  setTimeout(run, 30_000); // 서버가 막 떠서 바쁠 때는 피함
  setInterval(run, everyMs).unref?.();
}
