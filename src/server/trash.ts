// 휴지통 (docs/planning/04 §8.7, 14 §1.2·1.3, D-048): 지운 것은 묶음(delete_batch_id) 단위로 한 줄
// - 복구: 묶음 전체(repo.restore)
// - 영구 삭제: 묶음의 모든 행 + 변경 이력 + 붙은 사진·펫 그림(파일까지) + 트래커 칸. 되돌릴 수 없음, 보안 기록에 남김
// - 보존: 90일 지난 묶음은 휴지통을 열 때 영구 삭제
// ponytail: 매일 도는 예약 정리는 M-21 — 지금은 휴지통 화면을 열 때만 정리
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/index.ts";
import { attachments, revisions, trackerCells, trackerMonthItems } from "../db/schema.ts";
import { audit } from "./audit.ts";
import { removeImageFiles } from "./files.ts";
import { removePetFiles } from "./pets.ts";
import { registeredTables, restore, type Ctx } from "./repo.ts";
// 서비스마다 자기 테이블을 등록하므로 모두 불러와 둠(묶음이 여러 영역에 걸쳐도 함께 복구·삭제)
import "./budget.ts";
import "./calendar.ts";
import "./career.ts";
import "./cards.ts";
import "./finance.ts";
import "./goals.ts";
import "./health.ts";
import "./journal.ts";
import "./memos.ts";
import "./recurring.ts";
import "./restraint.ts";
import "./reviews.ts";
import "./wish.ts";

export const RETENTION_DAYS = 90;
const DETAIL = new Set(["card", "pay", "account"]); // 결제수단 설정 행(결제수단과 늘 한 묶음)

export type AnyRow = Record<string, unknown> & { id: string; deletedAt: Date; deleteBatchId: string | null };
const won = (n: unknown) => `${Number(n).toLocaleString("ko-KR")}원`;

// 목록에 보일 것: 영역 이름과 행 이름. 위에 있을수록 묶음의 대표(예: 캘린더를 지우면 일정보다 캘린더가 보임)
// 여기 없는 테이블(사진, 반복 예외, 작품 정보 등)은 다른 것과 함께 지워진 부속물 — 목록엔 안 보이고 함께 복구·삭제됨
export const SHOWN: Record<string, { area: string; name: (r: AnyRow, batch: { entity: string; row: AnyRow }[]) => string }> = {
  calendar: { area: "일정", name: (r) => `${r.name} 캘린더` },
  event: { area: "일정", name: (r) => String(r.title) },
  goal_category: { area: "목표", name: (r) => `${r.name} 분류` },
  goal: { area: "목표", name: (r) => String(r.title ?? r.name ?? "목표") },
  tracker_item: { area: "목표", name: (r) => `${r.name} (트래커)` },
  transaction: { area: "지출", name: (r) => `${r.title ?? (r.type === "income" ? "수입" : "지출")} · ${won(r.amount)}` },
  recurring_payment: { area: "고정 지출", name: (r) => `${r.name} · ${won(r.amount)}` },
  planned_expense: { area: "예산", name: (r) => `큰 지출 ${r.name}` },
  fin_category: { area: "지출", name: (r) => `${r.name} 분류` },
  payment_method: { area: "자산", name: (r) => `${r.name} ${({ card: "카드", pay: "페이", account: "계좌" } as Record<string, string>)[String(r.kind)] ?? "결제수단"}` },
  // 카드·페이·계좌 설정 행: 휴지통에선 결제수단과 한 묶음이라 대표가 아님. 작업 기록에서 설정만 고쳤을 때의 이름(결제수단을 함께 넘겨 받음)
  card: { area: "자산", name: (r, b) => `${b.find((x) => x.row.id === r.paymentMethodId)?.row.name ?? ""} 카드`.trim() },
  pay: { area: "자산", name: (r, b) => `${b.find((x) => x.row.id === r.paymentMethodId)?.row.name ?? ""} 페이`.trim() },
  account: { area: "자산", name: (r, b) => `${b.find((x) => x.row.id === r.paymentMethodId)?.row.name ?? ""} 계좌`.trim() },
  restraint_entry: { area: "참은 소비", name: (r) => `${r.name} · ${won(r.amount)}` },
  journal_topic: { area: "일기", name: (r) => `${r.name} 분류` },
  journal_entry: { area: "일기", name: (r) => String(r.title || (r.date ? `${r.date} 일기` : "날짜 없는 일기")) },
  memo: { area: "메모", name: (r) => String(r.title || String(r.body).slice(0, 30) || "제목 없는 메모") },
  review_thread: { area: "리뷰", name: (r) => String(r.title) },
  review_post: { area: "리뷰", name: (r) => `후기 · ${String(r.body).slice(0, 30)}` }, // 글타래와 함께 지웠으면 글타래가 대표
  journal_comment: { area: "일기", name: (r) => `댓글 · ${String(r.body).slice(0, 30)}` }, // 일기와 함께 지웠으면 일기가 대표
  wish_item: { area: "위시", name: (r) => String(r.name) },
  health_record: { area: "건강", name: (r) => `${r.kind === "weight" ? "체중" : "혈당"} 기록 · ${r.date}` }, // 값은 풀지 않음
  pet: { area: "펫", name: (r) => String(r.name) },
  career_doc: { area: "커리어", name: (r) => String(r.title) },
  career_doc_version: { area: "커리어", name: (r) => `버전 ${r.label}` },
  career_experience: { area: "커리어", name: (r) => String(r.title) },
};

async function deletedRows(ctx: Ctx, batchIds?: string[]) {
  const out: { entity: string; table: PgTable; row: AnyRow }[] = [];
  for (const { entity, table } of registeredTables()) {
    const rows = (await db
      .select()
      .from(table as PgTable)
      .where(and(eq(table.userId, ctx.userId), isNotNull(table.deletedAt), batchIds ? inArray(table.deleteBatchId, batchIds) : undefined))) as AnyRow[];
    for (const row of rows) out.push({ entity, table: table as PgTable, row });
  }
  return out;
}

const groupByBatch = <T extends { row: AnyRow }>(rows: T[]) => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.row.deleteBatchId ?? r.row.id;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
};

/** 영구 삭제: 묶음들의 모든 행, 그 변경 이력, 붙은 사진(파일까지), 트래커 칸·달 연결 */
export async function purge(ctx: Ctx, batchIds: string[], reason: "user" | "retention" = "user") {
  if (!batchIds.length) return 0;
  const rows = await deletedRows(ctx, batchIds);
  const ids = rows.map((r) => r.row.id);
  if (!ids.length) return 0;
  const files: string[] = [];
  await db.transaction(async (tx) => {
    // 이 행들에 붙은 사진(어디에 속했든)도 함께
    const owned = await tx
      .delete(attachments)
      .where(and(eq(attachments.userId, ctx.userId), or(inArray(attachments.ownerId, ids), inArray(attachments.id, ids))))
      .returning({ id: attachments.id, storageKey: attachments.storageKey });
    files.push(...owned.map((a) => a.storageKey));
    const itemIds = rows.filter((r) => r.entity === "tracker_item").map((r) => r.row.id);
    if (itemIds.length) {
      await tx.delete(trackerCells).where(and(eq(trackerCells.userId, ctx.userId), inArray(trackerCells.itemId, itemIds)));
      await tx.delete(trackerMonthItems).where(and(eq(trackerMonthItems.userId, ctx.userId), inArray(trackerMonthItems.itemId, itemIds)));
    }
    for (const { table } of registeredTables()) {
      if (table === attachments) continue;
      await tx.delete(table as PgTable).where(and(eq(table.userId, ctx.userId), isNotNull(table.deletedAt), inArray(table.deleteBatchId, batchIds)));
    }
    await tx.delete(revisions).where(and(eq(revisions.userId, ctx.userId), inArray(revisions.entityId, [...ids, ...owned.map((a) => a.id)])));
  });
  await removeImageFiles(files);
  for (const r of rows.filter((x) => x.entity === "pet")) await removePetFiles(ctx.userId, r.row.id);
  await audit("trash.purge", { userId: ctx.userId, detail: { batches: batchIds.length, rows: ids.length, reason } });
  return ids.length;
}

/** 휴지통 목록(최근 지운 것부터). 열 때 보존 기간 지난 묶음은 먼저 영구 삭제 */
export async function trashView(ctx: Ctx, now = new Date()) {
  const cutoff = now.getTime() - RETENTION_DAYS * 86_400_000;
  let groups = groupByBatch(await deletedRows(ctx));
  const expired = [...groups].filter(([, g]) => Math.min(...g.map((x) => x.row.deletedAt.getTime())) < cutoff).map(([k]) => k);
  if (expired.length) {
    await purge(ctx, expired, "retention");
    groups = groupByBatch(await deletedRows(ctx));
  }
  const order = Object.keys(SHOWN);
  return [...groups]
    .flatMap(([batchId, g]) => {
      const main = g.filter((x) => SHOWN[x.entity]).sort((a, b) => order.indexOf(a.entity) - order.indexOf(b.entity))[0];
      if (!main) return []; // 부속물만 남은 묶음(예: 글에서 뺀 사진)은 목록에 안 보임 — 보존 기간에 정리
      const deletedAt = main.row.deletedAt;
      const daysLeft = Math.max(0, RETENTION_DAYS - Math.floor((now.getTime() - deletedAt.getTime()) / 86_400_000));
      const others = g.filter((x) => x !== main && SHOWN[x.entity] && !DETAIL.has(x.entity)).length;
      return [{ batchId, entity: main.entity, id: main.row.id, area: SHOWN[main.entity].area, name: SHOWN[main.entity].name(main.row, g), others, deletedAt: deletedAt.toISOString(), daysLeft }];
    })
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
export type TrashItem = Awaited<ReturnType<typeof trashView>>[number];

/** 복구: 묶음 전체(대표 행으로) */
export const restoreBatch = (ctx: Ctx, entity: string, id: string) => restore(ctx, entity, id);
