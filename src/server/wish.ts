// 위시 서비스 (docs/planning/09, 15 §9). 작품 위시 → 작품 기록은 media.ts createMedia(fromWish)
// 상태: 담아둠 → 구매함(지출 연결 또는 없이) / 그만둠 → 다시 담기. 작품은 담아둠 → 시작함 / 다 봄
// 참은 소비 연결(20): 그만둘 때 기록, 참은 위시를 사면 "나중에 샀어요", 카드에 "○월에 참음"·월말 후보 표시
// ponytail: 링크 미리보기·같은 링크 경고는 P1
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { transactions, wishItems } from "../db/schema.ts";
import { AppError } from "./errors.ts";
import { imagesOf, linkImages } from "./files.ts";
import { autoEligible } from "../lib/restraint.ts";
import type { Currency } from "../lib/format.ts";
import { cleanForeign, createTransaction, foreignFields, txRepo } from "./finance.ts";
import { resolveCategory } from "./item-categories.ts";
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
    kind: z.enum(["shopping", "media"]),
    mediaKind: z.enum(["book", "movie", "drama"]).nullable().default(null),
    name: z.string().trim().min(1, "이름을 입력해 주세요").max(100, "이름은 100자까지 쓸 수 있어요"),
    level: z.enum(["need", "want", "like"]).nullable().default(null),
    categoryId: z.uuid().nullable().default(null), // 쇼핑: 분류(level은 분류의 기록 방식을 따름)
    price: z.number().int().min(1, "가격을 입력해 주세요").max(10_000_000_000, "100억 원까지 입력할 수 있어요").nullable().default(null), // 원
    ...foreignFields, // 다른 통화면 그 통화 가격(price는 원화 환산액)
    seenWhere: z.string().trim().max(1000).nullable().default(null),
    links: z.array(url).max(10, "링크는 10개까지 넣을 수 있어요").default([]),
    photoIds: z.array(z.uuid()).max(10, "사진은 10장까지 넣을 수 있어요").default([]),
  })
  .refine((v) => v.kind !== "shopping" || v.price, { path: ["price"], message: "가격을 입력해 주세요" })
  .refine((v) => v.kind !== "media" || v.mediaKind, { path: ["mediaKind"], message: "종류를 골라 주세요" })
  .transform((v) => ({
    ...(v.kind === "shopping" ? cleanForeign(v) : { ...v, currency: "KRW" as const, foreignAmount: null }),
    level: v.kind === "shopping" ? (v.level ?? "like") : null,
    price: v.kind === "shopping" ? v.price : null,
    mediaKind: v.kind === "media" ? v.mediaKind : null,
    categoryId: v.kind === "shopping" ? v.categoryId : null,
    seenWhere: v.seenWhere || null,
  }));
export type WishInput = z.input<typeof wishInput>;

/** 쇼핑 위시: 고른 분류로 level을 맞춤(안 골랐으면 level이 같은 첫 분류) */
async function withCategory(ctx: Ctx, v: z.infer<typeof wishInput>) {
  if (v.kind !== "shopping") return v;
  const c = await resolveCategory(ctx, "wish", v.categoryId, v.level!);
  return { ...v, categoryId: c.categoryId, level: c.type as "need" };
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
  const restrained = await restrainedOf(
    ctx,
    rows.map((r) => r.id),
  );
  const month = todayIn().slice(0, 7);
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
    candidate: autoEligible({ ...r, createdDate: r.createdAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }), counted: restrained.has(r.id) }, month),
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
    const boughtAt = made?.row.date ?? todayIn();
    const row = await wishRepo.update(ctx, id, version, { status: "bought", doneAt: boughtAt, transactionId: made?.row.id ?? null, droppedReason: null }, { tx: t });
    await markLaterBought(ctx, t, id, boughtAt.slice(0, 7));
    return { wish: row, transaction: made };
  });
}

/** 다시 담기(구매함·그만둠·작품 → 담아둠). removeTx: 연결 지출도 휴지통으로 */
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
  const w = await shopping(ctx, id);
  const r = parse(z.string().trim().max(100, "이유는 100자까지 쓸 수 있어요").nullable(), reason);
  return db.transaction(async (t) => {
    const row = await wishRepo.update(ctx, id, version, { status: "dropped", doneAt: todayIn(), droppedReason: r || null }, { tx: t });
    if (record) await recordDropped(ctx, t, w);
    return row;
  });
}
