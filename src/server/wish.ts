// 위시 서비스 (docs/planning/09, 15 §9): 갖고 싶은 물건·보고 싶은 작품을 한 목록에. 분류는 이름만(item-categories.ts)
// 상태: 담아둠 → 했어요(status bought. 가격이 있으면 지출도 함께 또는 없이) / 그만둠 → 다시 담기
// 참은 소비 연결(20): 그만둘 때 직접 기록, 참은 위시를 사면 "나중에 샀어요". 월말 자동 후보는 없음
// 예전 열(kind·media_kind·level·media_log_id)은 남겨 두고 쓰지 않음
// ponytail: 링크 미리보기·같은 링크 경고는 P1
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { transactions, wishItems } from "../db/schema.ts";
import { AppError } from "./errors.ts";
import { imagesOf, linkImages } from "./files.ts";
import type { Currency } from "../lib/format.ts";
import { cleanForeign, createTransaction, foreignFields, txRepo } from "./finance.ts";
import { checkCategory } from "./item-categories.ts";
import { markLaterBought, recordDropped, restrainedOf } from "./restraint.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { todayIn } from "./time.ts";
import { parse } from "./validate.ts";

export const wishRepo = defineRepo(wishItems, "wish_item");
const OWNER = "wish_item";

const url = z
  .string()
  .trim()
  .max(2000)
  // 주소 앞에 https://만 붙여 줌. ftp:// 같은 다른 방식은 그대로 둬서 아래에서 거절(https://ftp://… 로 깨지지 않게)
  .transform((s) => (/^[a-z][a-z\d+.-]*:\/\//i.test(s) ? s : `https://${s}`))
  .pipe(z.url({ protocol: /^https?$/, error: "링크를 다시 확인해 주세요" }));

export const wishInput = z
  .object({
    name: z.string().trim().min(1, "이름을 입력해 주세요").max(100, "이름은 100자까지 쓸 수 있어요"),
    categoryId: z.uuid().nullable().default(null),
    price: z.number().int().min(1, "가격을 다시 확인해 주세요").max(10_000_000_000, "100억 원까지 입력할 수 있어요").nullable().default(null), // 원, 선택
    ...foreignFields, // 다른 통화면 그 통화 가격(price는 원화 환산액)
    seenWhere: z.string().trim().max(1000).nullable().default(null),
    links: z.array(url).max(10, "링크는 10개까지 넣을 수 있어요").default([]),
    photoIds: z.array(z.uuid()).max(10, "사진은 10장까지 넣을 수 있어요").default([]),
  })
  // 가격이 없으면 통화도 원(외화 금액만 남지 않게)
  .transform((v) => ({ ...(v.price ? cleanForeign(v) : { ...v, currency: "KRW" as const, foreignAmount: null }), seenWhere: v.seenWhere || null }));
export type WishInput = z.input<typeof wishInput>;

/** 고른 분류가 내 것인지 확인. kind는 예전 열 — 언제나 shopping으로 둠(참은 소비가 이 열로 고름) */
async function withCategory(ctx: Ctx, v: z.infer<typeof wishInput>) {
  return { ...v, kind: "shopping" as const, categoryId: await checkCategory(ctx, v.categoryId) };
}

export async function createWish(ctx: Ctx, input: unknown) {
  const { photoIds, ...v } = await withCategory(ctx, parse(wishInput, input));
  return db.transaction(async (tx) => {
    const row = await wishRepo.create(ctx, v, { tx });
    await linkImages(tx, ctx, OWNER, row.id, photoIds);
    return row;
  });
}

export async function updateWish(ctx: Ctx, id: string, version: number, input: unknown) {
  const { photoIds, ...v } = await withCategory(ctx, parse(wishInput, input));
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
  const restrained = await restrainedOf(
    ctx,
    rows.map((r) => r.id),
  );
  const txIds = rows.flatMap((r) => (r.transactionId ? [r.transactionId] : []));
  const alive = txIds.length
    ? new Set((await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.userId, ctx.userId), inArray(transactions.id, txIds), isNull(transactions.deletedAt)))).map((t) => t.id))
    : new Set<string>();
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    name: r.name,
    categoryId: r.categoryId,
    price: r.price,
    currency: r.currency as Currency,
    foreignAmount: r.foreignAmount,
    seenWhere: r.seenWhere,
    links: r.links,
    status: r.status,
    doneAt: r.doneAt,
    droppedReason: r.droppedReason,
    txGone: !!r.transactionId && !alive.has(r.transactionId),
    hasTx: !!r.transactionId,
    createdAt: r.createdAt.toISOString(),
    photos: photos.get(r.id) ?? [],
    restrained: restrained.get(r.id) ?? null, // { month, status: counted | later_bought }
  }));
}
export type WishItem = Awaited<ReturnType<typeof wishList>>[number];

/** 했어요(샀어요·봤어요): 지출 생성과 상태 변경을 한 번에(15 §9). 지출 없이(선물 받음·작품 등)도 */
export async function purchaseWish(ctx: Ctx, id: string, version: number, tx: unknown | null) {
  const w = await wishRepo.get(ctx, id);
  if (w.status === "bought") throw new AppError("VERSION_CONFLICT", "이미 했어요로 옮겼어요");
  return db.transaction(async (t) => {
    const made = tx ? await createTransaction(ctx, tx, t) : null;
    const boughtAt = made?.row.date ?? todayIn();
    const row = await wishRepo.update(ctx, id, version, { status: "bought", doneAt: boughtAt, transactionId: made?.row.id ?? null, droppedReason: null }, { tx: t });
    await markLaterBought(ctx, t, id, boughtAt.slice(0, 7));
    return { wish: row, transaction: made };
  });
}

/** 다시 담기(했어요·그만둠 → 담아둠). removeTx: 연결 지출도 휴지통으로 */
export async function reopenWish(ctx: Ctx, id: string, version: number, removeTx = false) {
  const w = await wishRepo.get(ctx, id);
  return db.transaction(async (t) => {
    if (removeTx && w.transactionId) await txRepo.remove(ctx, w.transactionId, { tx: t }).catch(() => null);
    if (w.status === "bought") await markLaterBought(ctx, t, id, null);
    return wishRepo.update(ctx, id, version, { status: "saved", doneAt: null, droppedReason: null, transactionId: null, mediaLogId: null }, { tx: t });
  });
}

/** 그만둠. record면 가격만큼 이번 달 참은 소비로(20 §4.1, 기본 켬) */
export async function dropWish(ctx: Ctx, id: string, version: number, reason: string | null, record = false) {
  const w = await wishRepo.get(ctx, id);
  const r = parse(z.string().trim().max(100, "이유는 100자까지 쓸 수 있어요").nullable(), reason);
  return db.transaction(async (t) => {
    const row = await wishRepo.update(ctx, id, version, { status: "dropped", doneAt: todayIn(), droppedReason: r || null }, { tx: t });
    if (record && w.price) await recordDropped(ctx, t, w);
    return row;
  });
}
