// 작품 기록 서비스 (docs/planning/08 §3, 15 §8). 화면 규칙은 src/lib/media.ts
// 화면에서는 작품 1개 = 기록 1개로 다룸(추가·수정·삭제를 함께). 다시 읽기·보기(기록 여러 개)는 화면이 생기면
import { asc, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/index.ts";
import { mediaLogs, mediaWorks } from "../db/schema.ts";
import { uuidv7 } from "../db/id.ts";
import { attachmentRepo } from "./files.ts";
import { AppError } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { todayIn } from "./time.ts";
import { parse } from "./validate.ts";
import { wishRepo } from "./wish.ts";

export const workRepo = defineRepo(mediaWorks, "media_work");
export const logRepo = defineRepo(mediaLogs, "media_log");

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 선택해 주세요");
export const mediaInput = z
  .object({
    kind: z.enum(["book", "movie", "drama"]),
    title: z.string().trim().min(1, "제목을 입력해 주세요").max(100, "제목은 100자까지 쓸 수 있어요"),
    creator: z.string().trim().max(100).nullable().default(null),
    coverId: z.uuid().nullable().default(null),
    status: z.enum(["ongoing", "done", "dropped"]),
    startDate: ymd.nullable().default(null),
    endDate: ymd.nullable().default(null),
    rating: z.number().min(0.5).max(5).multipleOf(0.5, "별점을 다시 골라 주세요").nullable().default(null),
    oneLiner: z.string().trim().max(100, "한 줄 평은 100자까지 쓸 수 있어요").nullable().default(null),
    review: z.string().max(50_000, "감상은 5만 자까지 쓸 수 있어요").nullable().default(null),
    whereText: z.string().trim().max(30).nullable().default(null),
  })
  .refine((v) => v.kind !== "movie" || v.status === "done", { path: ["status"], message: "상태를 다시 골라 주세요" })
  .refine((v) => v.status !== "ongoing" || v.startDate, { path: ["startDate"], message: "시작한 날을 골라 주세요" })
  .refine((v) => v.status === "ongoing" || v.endDate, { path: ["endDate"], message: "끝난 날을 골라 주세요" })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, { path: ["endDate"], message: "끝난 날이 시작한 날보다 빨라요" })
  .transform((v) => ({
    ...v,
    creator: v.creator || null,
    oneLiner: v.oneLiner || null,
    review: v.review?.trim() ? v.review : null,
    whereText: v.whereText || null,
    // 영화는 본 날 하나, 진행 중이면 끝난 날 없음
    startDate: v.kind === "movie" ? null : v.startDate,
    endDate: v.status === "ongoing" ? null : v.endDate,
  }));
export type MediaInput = z.input<typeof mediaInput>;

async function checkCover(ctx: Ctx, id: string | null) {
  if (id && !(await attachmentRepo.get(ctx, id).catch(() => null))) throw new AppError("VALIDATION_FAILED", "표지를 다시 올려 주세요");
}

const split = (v: z.infer<typeof mediaInput>) => {
  const { kind, title, creator, coverId, ...log } = v;
  return { work: { kind, title, creator, coverAttachmentId: coverId }, log };
};

/** 작품 + 첫 기록. 위시에서 왔으면 위시를 시작함·다 봄으로(09 §7) */
export async function createMedia(ctx: Ctx, input: unknown, fromWish?: { id: string; version: number }) {
  const v = parse(mediaInput, input);
  await checkCover(ctx, v.coverId);
  const { work, log } = split(v);
  return db.transaction(async (tx) => {
    const w = await workRepo.create(ctx, work, { tx });
    const row = await logRepo.create(ctx, { ...log, workId: w.id, fromWishId: fromWish?.id ?? null }, { tx });
    if (fromWish) await wishRepo.update(ctx, fromWish.id, fromWish.version, { status: log.status === "ongoing" ? "started" : "finished", doneAt: todayIn(), mediaLogId: row.id }, { tx });
    return row;
  });
}

/** 기록 수정(작품 정보도 함께). 충돌 확인은 기록의 version으로 */
export async function updateMedia(ctx: Ctx, logId: string, version: number, input: unknown) {
  const v = parse(mediaInput, input);
  await checkCover(ctx, v.coverId);
  const { work, log } = split(v);
  const cur = await logRepo.get(ctx, logId);
  const w = await workRepo.get(ctx, cur.workId);
  return db.transaction(async (tx) => {
    await workRepo.update(ctx, w.id, w.version, work, { tx });
    return logRepo.update(ctx, logId, version, log, { tx });
  });
}

/** 삭제: 기록과 작품을 한 묶음으로 휴지통에(복구도 함께) */
export async function removeMedia(ctx: Ctx, logId: string) {
  const cur = await logRepo.get(ctx, logId);
  const batchId = uuidv7();
  await db.transaction(async (tx: Tx) => {
    await logRepo.remove(ctx, logId, { tx, batchId });
    const others = (await logRepo.list(ctx, { limit: 1000 })).filter((l) => l.workId === cur.workId && l.id !== logId);
    if (!others.length) await workRepo.remove(ctx, cur.workId, { tx, batchId });
  });
}

/** 모든 기록(작품 정보 포함), 최근 것부터 */
// ponytail: 한 번에 전부(최대 1000개). 기록이 수천 개가 되면 달·상태별로 나눠 불러오기
export async function mediaList(ctx: Ctx) {
  const logs = await logRepo.list(ctx, { orderBy: [desc(mediaLogs.endDate), desc(mediaLogs.startDate), desc(mediaLogs.createdAt)], limit: 1000 });
  const works = logs.length ? await workRepo.list(ctx, { where: inArray(mediaWorks.id, [...new Set(logs.map((l) => l.workId))]), orderBy: [asc(mediaWorks.createdAt)], limit: 1000 }) : [];
  return logs.flatMap((l) => {
    const w = works.find((x) => x.id === l.workId);
    if (!w) return [];
    return [
      {
        id: l.id,
        version: l.version,
        kind: w.kind,
        title: w.title,
        creator: w.creator,
        coverId: w.coverAttachmentId,
        status: l.status,
        startDate: l.startDate,
        endDate: l.endDate,
        rating: l.rating,
        oneLiner: l.oneLiner,
        review: l.review,
        whereText: l.whereText,
      },
    ];
  });
}
export type MediaItem = Awaited<ReturnType<typeof mediaList>>[number];
