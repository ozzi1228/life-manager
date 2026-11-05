// 공통 데이터 접근 계층 (docs/planning/14 §1, 15 §2.5·§2.6, 17 M-04)
// 모든 사용자 데이터는 이 함수들로만 읽고 쓴다 → 규칙이 한곳에:
// - 사용자 범위: 항상 세션 사용자의 user_id로 거르고 채움(다른 사용자 것은 "없음"과 같게 404)
// - soft delete: 일반 조회는 deleted_at is null. 삭제는 묶음(delete_batch_id)으로, 복구도 묶음 전체
// - 낙관적 잠금: 수정마다 version +1, 보낸 version이 다르면 409 + 최신 값
// - 변경 이력: 같은 트랜잭션 안에서 바뀐 필드만 revisions에 기록
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, type Tx } from "../db/index.ts"; // 확장자 경로: scripts/*.mts에서도 불러옴
import { uuidv7 } from "../db/id.ts";
import { revisions } from "../db/schema.ts";
import { notFound, versionConflict } from "./errors.ts";

export type Ctx = { userId: string; actor: string; requestId?: string };

// 공통 열(src/db/columns.ts userData)을 가진 테이블
type Common = "id" | "userId" | "createdAt" | "updatedAt" | "deletedAt" | "deletedBy" | "deleteBatchId" | "version" | "source";
// ponytail: Drizzle 제네릭 테이블 타입이 복잡해 안쪽은 느슨하게 다루고, 바깥 함수 타입은 각 테이블의 $infer 타입으로 정확히
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = PgTable & Record<Common, any>;
type Row<T extends AnyTable> = T["$inferSelect"];
type Insert<T extends AnyTable> = Omit<T["$inferInsert"], Common>;
type Patch<T extends AnyTable> = Partial<Insert<T>>;

// 작업 기록 되돌리기(activity.ts)가 entity 이름으로 고치기·지우기를 부를 수 있게 저장소도 함께
type LooseRepo = {
  update(ctx: Ctx, id: string, version: number, patch: Record<string, unknown>, o?: { tx?: Tx }): Promise<unknown>;
  remove(ctx: Ctx, id: string, o?: { batchId?: string; tx?: Tx }): Promise<unknown>;
};
const registry: { entity: string; table: AnyTable; repo: LooseRepo }[] = [];
/** 등록된 사용자 데이터 테이블 전부(휴지통 목록·영구 삭제용). 서비스 모듈을 불러와야 채워짐 */
export const registeredTables = () => registry;

/** 사용자 데이터 테이블 하나의 저장소. entity는 변경 이력·휴지통에 쓰는 이름(예: "transaction") */
export function defineRepo<T extends AnyTable>(table: T, entity: string) {
  const mine = (ctx: Ctx, ...more: (SQL | undefined)[]) => and(eq(table.userId, ctx.userId), ...more);
  const alive = (ctx: Ctx, ...more: (SQL | undefined)[]) => mine(ctx, isNull(table.deletedAt), ...more);

  async function get(ctx: Ctx, id: string, tx: Tx | typeof db = db): Promise<Row<T>> {
    const [row] = await tx.select().from(table as PgTable).where(alive(ctx, eq(table.id, id))).limit(1);
    if (!row) throw notFound();
    return row as Row<T>;
  }

  const repo = {
    entity,
    table,
    get: (ctx: Ctx, id: string) => get(ctx, id),

    /** 살아 있는 행 목록. where·orderBy는 영역별로(기본: 최신 생성 순) */
    async list(ctx: Ctx, o: { where?: SQL; orderBy?: SQL[]; limit?: number } = {}): Promise<Row<T>[]> {
      return (await db
        .select()
        .from(table as PgTable)
        .where(alive(ctx, o.where))
        .orderBy(...(o.orderBy ?? [desc(table.id)]))
        .limit(Math.min(o.limit ?? 200, 5000))) as Row<T>[];
    },

    async create(ctx: Ctx, values: Insert<T>, o: { source?: string; tx?: Tx } = {}): Promise<Row<T>> {
      const run = async (tx: Tx) => {
        const [row] = await tx
          .insert(table as PgTable)
          .values({ ...values, userId: ctx.userId, source: o.source ?? "manual" } as T["$inferInsert"])
          .returning();
        await writeRevision(tx, ctx, entity, (row as { id: string }).id, "create", values as Record<string, unknown>, null);
        return row as Row<T>;
      };
      return o.tx ? run(o.tx) : db.transaction(run);
    },

    /** 바꿀 필드만 + 화면이 가진 version. 다르면 409(최신 값 포함) */
    async update(ctx: Ctx, id: string, version: number, patch: Patch<T>, o: { tx?: Tx } = {}): Promise<Row<T>> {
      const run = async (tx: Tx) => {
        const [cur] = (await tx
          .select()
          .from(table as PgTable)
          .where(alive(ctx, eq(table.id, id)))
          .for("update")) as Row<T>[];
        if (!cur) throw notFound();
        if (cur.version !== version) throw versionConflict(cur);
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
          const old = (cur as Record<string, unknown>)[k];
          if (v !== undefined && JSON.stringify(old) !== JSON.stringify(v)) {
            before[k] = old;
            after[k] = v;
          }
        }
        if (!Object.keys(after).length) return cur; // 바뀐 게 없으면 version도 그대로
        const [row] = await tx
          .update(table as PgTable)
          .set({ ...after, version: sql`${table.version} + 1`, updatedAt: new Date() })
          .where(mine(ctx, eq(table.id, id)))
          .returning();
        await writeRevision(tx, ctx, entity, id, "update", after, before);
        return row as Row<T>;
      };
      return o.tx ? run(o.tx) : db.transaction(run);
    },

    /** soft delete. 자식도 함께 지우려면 같은 batchId로 다른 저장소의 remove를 tx 안에서 부름 */
    async remove(ctx: Ctx, id: string, o: { batchId?: string; tx?: Tx } = {}) {
      const run = async (tx: Tx) => {
        await get(ctx, id, tx);
        const batchId = o.batchId ?? uuidv7();
        const [row] = await tx
          .update(table as PgTable)
          .set({ deletedAt: new Date(), deletedBy: ctx.actor, deleteBatchId: batchId })
          .where(mine(ctx, eq(table.id, id)))
          .returning();
        await writeRevision(tx, ctx, entity, id, "delete", null, null);
        return row as Row<T>;
      };
      return o.tx ? run(o.tx) : db.transaction(run);
    },

    /** 휴지통 목록(최근 삭제 순) */
    async trash(ctx: Ctx): Promise<Row<T>[]> {
      return (await db.select().from(table as PgTable).where(mine(ctx, isNotNull(table.deletedAt))).orderBy(desc(table.deletedAt))) as Row<T>[];
    },
  };
  registry.push({ entity, table, repo: repo as unknown as LooseRepo });
  return repo;
}

/** 복구: 그 행과 같은 묶음으로 지워진 모든 테이블의 행을 함께 살림 */
export async function restore(ctx: Ctx, entity: string, id: string) {
  const own = registry.find((r) => r.entity === entity);
  if (!own) throw notFound();
  return db.transaction(async (tx) => {
    const [row] = (await tx
      .select({ batch: own.table.deleteBatchId })
      .from(own.table as PgTable)
      .where(and(eq(own.table.userId, ctx.userId), eq(own.table.id, id), isNotNull(own.table.deletedAt)))) as { batch: string | null }[];
    if (!row?.batch) throw notFound();
    let count = 0;
    for (const { entity: e, table } of registry) {
      const back = (await tx
        .update(table as PgTable)
        .set({ deletedAt: null, deletedBy: null, deleteBatchId: null, version: sql`${table.version} + 1`, updatedAt: new Date() })
        .where(and(eq(table.userId, ctx.userId), eq(table.deleteBatchId, row.batch)))
        .returning({ id: table.id })) as { id: string }[];
      for (const b of back) await writeRevision(tx, ctx, e, b.id, "restore", null, null);
      count += back.length;
    }
    return { restored: count };
  });
}

async function writeRevision(
  tx: Tx,
  ctx: Ctx,
  entityType: string,
  entityId: string,
  action: "create" | "update" | "delete" | "restore",
  after: Record<string, unknown> | null,
  before: Record<string, unknown> | null,
) {
  await tx.insert(revisions).values({
    userId: ctx.userId,
    entityType,
    entityId,
    action,
    changedFields: Object.keys(after ?? {}),
    before,
    after,
    actor: ctx.actor,
    requestId: ctx.requestId,
  });
}
