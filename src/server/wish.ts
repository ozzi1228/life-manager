// 위시 서비스 (docs/planning/09, 15 §9). 작품 위시 → 작품 기록은 media.ts createMedia(fromWish)
// 상태: 담아둠 → 구매함(지출 연결 또는 없이) / 그만둠 → 다시 담기. 작품은 담아둠 → 시작함 / 다 봄
// ponytail: 그만둘 때 "참은 소비로 기록"은 참은 소비(M-22)에서. 링크 미리보기·같은 링크 경고는 P1
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { transactions, wishItems } from "../db/schema.ts";
import { AppError } from "./errors.ts";
import { imagesOf, linkImages } from "./files.ts";
import { createTransaction, txRepo } from "./finance.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { todayIn } from "./time.ts";
import { parse } from "./validate.ts";

export const wishRepo = defineRepo(wishItems, "wish_item");
const OWNER = "wish_item";

const url = z
  .string()
  .trim()
  .max(2000)
  .transform((s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`))
  .pipe(z.url({ protocol: /^https?$/, error: "링크를 다시 확인해 주세요" }));

export const wishInput = z
  .object({
    kind: z.enum(["shopping", "media"]),
    mediaKind: z.enum(["book", "movie", "drama"]).nullable().default(null),
    name: z.string().trim().min(1, "이름을 입력해 주세요").max(100, "이름은 100자까지 쓸 수 있어요"),
    level: z.enum(["need", "want", "like"]).nullable().default(null),
    price: z.number().int().min(1, "가격을 입력해 주세요").max(10_000_000_000, "100억 원까지 입력할 수 있어요").nullable().default(null),
    seenWhere: z.string().trim().max(1000).nullable().default(null),
    links: z.array(url).max(10, "링크는 10개까지 넣을 수 있어요").default([]),
    photoIds: z.array(z.uuid()).max(10, "사진은 10장까지 넣을 수 있어요").default([]),
  })
  .refine((v) => v.kind !== "shopping" || v.price, { path: ["price"], message: "가격을 입력해 주세요" })
  .refine((v) => v.kind !== "media" || v.mediaKind, { path: ["mediaKind"], message: "종류를 골라 주세요" })
  .transform((v) => ({
    ...v,
    level: v.kind === "shopping" ? (v.level ?? "like") : null,
    price: v.kind === "shopping" ? v.price : null,
    mediaKind: v.kind === "media" ? v.mediaKind : null,
    seenWhere: v.seenWhere || null,
  }));
export type WishInput = z.input<typeof wishInput>;

export async function createWish(ctx: Ctx, input: unknown) {
  const { photoIds, ...v } = parse(wishInput, input);
  return db.transaction(async (tx) => {
    const row = await wishRepo.create(ctx, v, { tx });
    await linkImages(tx, ctx, OWNER, row.id, photoIds);
    return row;
  });
}

export async function updateWish(ctx: Ctx, id: string, version: number, input: unknown) {
  const { photoIds, ...v } = parse(wishInput, input);
  const cur = await wishRepo.get(ctx, id);
  if (cur.kind !== v.kind) throw new AppError("VALIDATION_FAILED", "종류는 바꿀 수 없어요");
  return db.transaction(async (tx) => {
    const row = await wishRepo.update(ctx, id, version, v, { tx });
    await linkImages(tx, ctx, OWNER, id, photoIds);
    return row;
  });
}

/** 위시 전체 + 사진 + 연결 지출이 아직 있는지 */
export async function wishList(ctx: Ctx) {
  const rows = await wishRepo.list(ctx, { orderBy: [desc(wishItems.createdAt)], limit: 1000 });
  const photos = await imagesOf(
    ctx,
    OWNER,
    rows.map((r) => r.id),
  );
  const txIds = rows.flatMap((r) => (r.transactionId ? [r.transactionId] : []));
  const alive = txIds.length
    ? new Set((await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.userId, ctx.userId), inArray(transactions.id, txIds), isNull(transactions.deletedAt)))).map((t) => t.id))
    : new Set<string>();
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    kind: r.kind,
    mediaKind: r.mediaKind,
    name: r.name,
    level: r.level,
    price: r.price,
    seenWhere: r.seenWhere,
    links: r.links,
    status: r.status,
    doneAt: r.doneAt,
    droppedReason: r.droppedReason,
    txGone: !!r.transactionId && !alive.has(r.transactionId),
    hasTx: !!r.transactionId,
    createdAt: r.createdAt.toISOString(),
    photos: photos.get(r.id) ?? [],
  }));
}
export type WishItem = Awaited<ReturnType<typeof wishList>>[number];

async function shopping(ctx: Ctx, id: string) {
  const w = await wishRepo.get(ctx, id);
  if (w.kind !== "shopping") throw new AppError("BAD_REQUEST", "쇼핑 위시만 구매할 수 있어요");
  return w;
}

/** 구매함: 지출 생성과 상태 변경을 한 번에(15 §9). 지출 없이(선물 받음 등)도 */
export async function purchaseWish(ctx: Ctx, id: string, version: number, tx: unknown | null) {
  const w = await shopping(ctx, id);
  if (w.status === "bought") throw new AppError("VERSION_CONFLICT", "이미 구매함으로 옮겼어요");
  return db.transaction(async (t) => {
    const made = tx ? await createTransaction(ctx, tx, t) : null;
    const row = await wishRepo.update(ctx, id, version, { status: "bought", doneAt: made?.row.date ?? todayIn(), transactionId: made?.row.id ?? null, droppedReason: null }, { tx: t });
    return { wish: row, transaction: made };
  });
}

/** 다시 담기(구매함·그만둠·작품 → 담아둠). removeTx: 연결 지출도 휴지통으로 */
export async function reopenWish(ctx: Ctx, id: string, version: number, removeTx = false) {
  const w = await wishRepo.get(ctx, id);
  return db.transaction(async (t) => {
    if (removeTx && w.transactionId) await txRepo.remove(ctx, w.transactionId, { tx: t }).catch(() => null);
    return wishRepo.update(ctx, id, version, { status: "saved", doneAt: null, droppedReason: null, transactionId: null, mediaLogId: null }, { tx: t });
  });
}

export async function dropWish(ctx: Ctx, id: string, version: number, reason: string | null) {
  await shopping(ctx, id);
  const r = parse(z.string().trim().max(100, "이유는 100자까지 쓸 수 있어요").nullable(), reason);
  return wishRepo.update(ctx, id, version, { status: "dropped", doneAt: todayIn(), droppedReason: r || null });
}
