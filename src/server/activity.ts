// 작업 기록 (D-077): 최근 90일 동안 내가 한 일(변경 기록 revisions)을 동작 단위로 한 줄씩, 줄마다 되돌리기
// - 한 동작(Server Action 한 번) = requestId 하나 = 한 줄. requestId가 없는 옛 기록은 변경 하나가 한 줄
// - 되돌리기: 추가 → 휴지통, 수정 → 고치기 전 값, 삭제 → 복구, 복구 → 다시 휴지통
//   되돌린 변경은 requestId "undo:<줄 key>"로 남김 → 원래 줄에 "되돌림" 표시(되돌린 동작 자체는 목록에 안 보임)
// - 같은 항목이 그 뒤에 또 바뀌었으면(되돌린 것은 빼고) 최근 것부터 되돌려야 함(값이 엉키지 않게)
// - 자동 저장(기간 메모)·화면 설정(순서·보기 체크)·자동 작업(actor≠user)은 목록에서 뺌
// ponytail: 최근 1000개 변경을 불러와 화면에서 묶음. 되돌리기는 휴지통 복구만 따로 트랜잭션. 기록이 많아지면 SQL로 묶기
import { and, desc, eq, getTableColumns, gte, inArray, isNull } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/index.ts";
import { uuidv7 } from "../db/id.ts";
import { events, paymentMethods, revisions } from "../db/schema.ts";
import { AppError, notFound } from "./errors.ts";
import { nameMaps } from "./finance.ts";
import { changesOf } from "./history.ts";
import { registeredTables, restore, type Ctx } from "./repo.ts";
import { RETENTION_DAYS, SHOWN, type AnyRow } from "./trash.ts"; // trash.ts가 모든 서비스를 불러 저장소 등록을 채움

type Rev = typeof revisions.$inferSelect;
const SKIP_ENTITY = new Set(["period_note", "attachment", "restraint_month"]); // 자동 저장, 사진 올리기(글 저장 때 함께), 월 정산
const SKIP_FIELDS = new Set(["sort", "hiddenIn", "isHidden"]);
const DETAIL = new Set(["card", "pay", "account"]);
// 휴지통 목록엔 안 나오지만 혼자 바뀌는 것: 반복 일정의 "이 날만" 지우기·고치기, 예산, 위시·작품 분류, 작품 정보
const EXTRA: typeof SHOWN = {
  budget: { area: "예산", name: (r) => `${Number(String(r.month).slice(5))}월 예산` },
  item_category: { area: "위시·작품", name: (r) => `${r.name} 분류` },
  media_work: { area: "작품", name: (r) => String(r.title) },
  event_exception: { area: "일정", name: (r, all) => `${all.find((x) => x.row.id === r.eventId)?.row.title ?? "반복 일정"} · ${Number(String(r.originalDate).slice(5, 7))}월 ${Number(String(r.originalDate).slice(8))}일만` },
};
const nameOf = (e: string) => SHOWN[e] ?? EXTRA[e];
const VERB = { create: "추가", update: "수정", delete: "삭제", restore: "복구" } as const;
const keyOf = (r: Rev) => r.requestId ?? r.id;
const skipped = (r: Rev) => r.actor !== "user" || SKIP_ENTITY.has(r.entityType) || (r.action === "update" && r.changedFields.every((f) => SKIP_FIELDS.has(f)));

async function loadGroups(ctx: Ctx) {
  const since = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const revs = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.userId, ctx.userId), gte(revisions.createdAt, since)))
    .orderBy(desc(revisions.createdAt))
    .limit(1000);
  const groups = new Map<string, Rev[]>(); // 최신 줄부터
  for (const r of revs) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
  const undone = new Map<string, Date>();
  for (const [k, g] of groups) if (k.startsWith("undo:")) undone.set(k.slice(5), g[0].createdAt);
  const ignored = (k: string) => k.startsWith("undo:") || undone.has(k);
  // 이 줄 뒤에 같은 항목을 바꾼 (되돌리지 않은) 다른 동작이 있으면 막힘
  const blocked = (k: string) => groups.get(k)!.some((r) => revs.some((o) => o.entityId === r.entityId && keyOf(o) !== k && !ignored(keyOf(o)) && o.createdAt > r.createdAt));
  return { groups, undone, blocked };
}

/** 줄마다 대표 이름을 짓기 위해 변경된 행(지운 것 포함)과, 설정 행이면 그 결제수단까지 불러옴 */
async function rowsOf(ctx: Ctx, revs: Rev[]) {
  const out = new Map<string, { entity: string; row: AnyRow }>();
  for (const { entity, table } of registeredTables()) {
    const ids = [...new Set(revs.filter((r) => r.entityType === entity).map((r) => r.entityId))];
    if (!ids.length) continue;
    const rows = (await db.select().from(table as PgTable).where(and(eq(table.userId, ctx.userId), inArray(table.id, ids)))) as AnyRow[];
    for (const row of rows) out.set(row.id, { entity, row });
  }
  const pmIds = [...out.values()].filter((x) => DETAIL.has(x.entity)).map((x) => String(x.row.paymentMethodId));
  if (pmIds.length) for (const row of (await db.select().from(paymentMethods).where(inArray(paymentMethods.id, pmIds))) as unknown as AnyRow[]) if (!out.has(row.id)) out.set(row.id, { entity: "payment_method", row });
  const eventIds = [...out.values()].filter((x) => x.entity === "event_exception").map((x) => String(x.row.eventId));
  if (eventIds.length) for (const row of (await db.select().from(events).where(inArray(events.id, eventIds))) as unknown as AnyRow[]) if (!out.has(row.id)) out.set(row.id, { entity: "event", row });
  return out;
}

export async function activityList(ctx: Ctx) {
  const { groups, undone, blocked } = await loadGroups(ctx);
  const shown = [...groups].filter(([k, g]) => !k.startsWith("undo:") && !g.every(skipped)).slice(0, 200);
  const [rows, names] = await Promise.all([rowsOf(ctx, shown.flatMap(([, g]) => g)), nameMaps(ctx)]);
  const order = [...Object.keys(SHOWN), ...Object.keys(EXTRA)];
  const all = [...rows.values()];
  return shown.flatMap(([key, g]) => {
    const live = g.filter((r) => !skipped(r) && rows.has(r.entityId));
    const main = [...live].sort((a, b) => (order.indexOf(a.entityType) + 1 || 999) - (order.indexOf(b.entityType) + 1 || 999))[0];
    if (!main) return [];
    const shownAs = nameOf(main.entityType);
    const row = rows.get(main.entityId)!.row;
    const others = new Set(live.filter((r) => r.entityId !== main.entityId && nameOf(r.entityType) && !DETAIL.has(r.entityType)).map((r) => r.entityId)).size;
    return [
      {
        key,
        at: g[0].createdAt.toISOString(),
        verb: VERB[main.action as keyof typeof VERB] ?? main.action,
        area: shownAs?.area ?? "기타",
        name: shownAs ? shownAs.name(row, all) : "항목",
        others,
        changes: main.action === "update" ? changesOf(main.entityType, main.before, main.after, names) : [],
        undoneAt: undone.get(key)?.toISOString() ?? null,
        canUndo: !undone.has(key) && !blocked(key),
      },
    ];
  });
}
export type ActivityItem = Awaited<ReturnType<typeof activityList>>[number];

/** 한 줄(동작 하나)을 되돌림 */
export async function undoActivity(ctx: Ctx, key: string) {
  const { groups, undone, blocked } = await loadGroups(ctx);
  const g = groups.get(key);
  if (!g || key.startsWith("undo:")) throw notFound();
  if (undone.has(key)) throw new AppError("VALIDATION_FAILED", "이미 되돌린 작업이에요");
  if (blocked(key)) throw new AppError("VALIDATION_FAILED", "그 뒤에 또 바뀐 항목이 있어요. 더 최근 작업부터 되돌려 주세요");
  const uctx: Ctx = { ...ctx, requestId: `undo:${key}` };
  const reg = registeredTables();
  const toRestore: Rev[] = [];
  await db.transaction(async (tx) => {
    const batchId = uuidv7(); // 이 줄에서 지울 것은 휴지통에서 한 묶음
    for (const r of g) {
      const own = reg.find((x) => x.entity === r.entityType);
      if (!own) continue;
      const [cur] = (await tx.select().from(own.table as PgTable).where(and(eq(own.table.userId, ctx.userId), eq(own.table.id, r.entityId)))) as (AnyRow & { version: number })[];
      if (!cur) continue; // 영구 삭제됨
      const alive = !cur.deletedAt;
      if (r.action === "delete") {
        if (!alive) toRestore.push(r);
      } else if (r.action === "create" || r.action === "restore") {
        if (alive) await own.repo.remove(uctx, r.entityId, { batchId, tx });
      } else if (r.action === "update") {
        if (!alive) throw new AppError("VALIDATION_FAILED", "휴지통에 있는 항목이에요. 휴지통에서 먼저 복구해 주세요");
        // jsonb에 문자열로 저장된 시각은 Date로(timestamp 열)
        const cols = getTableColumns(own.table as PgTable) as Record<string, { dataType: string }>;
        const patch = Object.fromEntries(Object.entries((r.before ?? {}) as Record<string, unknown>).map(([k, v]) => [k, cols[k]?.dataType === "date" && typeof v === "string" ? new Date(v) : v]));
        await own.repo.update(uctx, r.entityId, cur.version, patch, { tx });
      }
    }
  });
  // 삭제를 되돌리기 = 휴지통에서 묶음째 복구(같은 묶음은 한 번만)
  const done = new Set<string>();
  for (const r of toRestore) {
    if (done.has(r.entityId)) continue;
    const own = reg.find((x) => x.entity === r.entityType)!;
    const [cur] = (await db.select().from(own.table as PgTable).where(and(eq(own.table.id, r.entityId), eq(own.table.userId, ctx.userId), isNull(own.table.deletedAt)))) as AnyRow[];
    if (cur) continue;
    await restore(uctx, r.entityType, r.entityId);
    done.add(r.entityId);
  }
  return null;
}
