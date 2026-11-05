// 일기 서비스 (docs/planning/08 §2, 15 §8)
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { journalEntries, journalTopics } from "../db/schema.ts";
import { GOAL_PALETTE } from "../lib/palette.ts";
import { AppError } from "./errors.ts";
import { imagesOf, linkImages } from "./files.ts";
import { dup } from "./finance.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const topicRepo = defineRepo(journalTopics, "journal_topic");
export const entryRepo = defineRepo(journalEntries, "journal_entry");
const OWNER = "journal_entry";

// 기본 주제(08 §2.2). 색은 트래커 팔레트 재사용
const DEFAULT_TOPICS = ["일상", "회고", "감사", "여행", "생각", "업무"];

export async function topicList(ctx: Ctx) {
  const list = await topicRepo.list(ctx, { orderBy: [asc(journalTopics.sort)] });
  if (list.length) return list;
  const [any] = await db.select({ id: journalTopics.id }).from(journalTopics).where(eq(journalTopics.userId, ctx.userId)).limit(1);
  if (any) return list;
  await db.transaction(async (tx) => {
    for (const [i, name] of DEFAULT_TOPICS.entries()) await topicRepo.create(ctx, { name, colorHex: GOAL_PALETTE[(i * 2) % GOAL_PALETTE.length].hex, sort: i }, { source: "default", tx });
  });
  return topicRepo.list(ctx, { orderBy: [asc(journalTopics.sort)] });
}

// ── 분류(주제) 편집: 이름·색·순서·지우기. 지운 분류의 일기는 분류 없음으로 보임 ──
const topicName = z.string().trim().min(1, "이름을 입력해 주세요").max(20, "이름은 20자까지 쓸 수 있어요");
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "색을 다시 골라 주세요");

export async function addTopic(ctx: Ctx, name: unknown) {
  const list = await topicRepo.list(ctx, {});
  return topicRepo.create(ctx, { name: parse(topicName, name), colorHex: GOAL_PALETTE[list.length % GOAL_PALETTE.length].hex, sort: list.length }).catch((e) => dup(e, "분류"));
}
export async function renameTopic(ctx: Ctx, id: string, name: unknown) {
  const cur = await topicRepo.get(ctx, id);
  return topicRepo.update(ctx, id, cur.version, { name: parse(topicName, name) }).catch((e) => dup(e, "분류"));
}
export async function colorTopic(ctx: Ctx, id: string, colorHex: unknown) {
  const cur = await topicRepo.get(ctx, id);
  return topicRepo.update(ctx, id, cur.version, { colorHex: parse(hex, colorHex).toUpperCase() });
}
export async function removeTopic(ctx: Ctx, id: string) {
  await topicRepo.get(ctx, id);
  await topicRepo.remove(ctx, id);
}
export async function reorderTopics(ctx: Ctx, ids: string[]) {
  if (ids.length > 100) throw new AppError("VALIDATION_FAILED", "순서를 저장할 수 없어요");
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(journalTopics).set({ sort: i, updatedAt: new Date() }).where(and(eq(journalTopics.id, id), eq(journalTopics.userId, ctx.userId)));
  });
}

export const entryInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 선택해 주세요"),
  topicId: z.uuid().nullable().default(null),
  title: z.string().trim().max(100, "제목은 100자까지 쓸 수 있어요").nullable().default(null),
  bodyMd: z.string().max(50_000, "본문은 5만 자까지 쓸 수 있어요").default(""),
  photoIds: z.array(z.uuid()).max(10, "사진은 10장까지 넣을 수 있어요").default([]),
});

async function checkTopic(ctx: Ctx, topicId: string | null) {
  if (topicId && !(await topicRepo.get(ctx, topicId).catch(() => null)))
    throw new AppError("VALIDATION_FAILED", "주제를 다시 골라 주세요", { fields: [{ path: "topicId", rule: "exists", message: "주제를 다시 골라 주세요" }] });
}

const empty = (v: { title: string | null; bodyMd: string; photoIds: string[] }) => !v.title && !v.bodyMd.trim() && !v.photoIds.length;

export async function createEntry(ctx: Ctx, input: unknown) {
  const { photoIds, ...v } = parse(entryInput, input);
  if (empty({ ...v, photoIds })) throw new AppError("VALIDATION_FAILED", "내용을 적어 주세요");
  await checkTopic(ctx, v.topicId);
  return db.transaction(async (tx) => {
    const row = await entryRepo.create(ctx, { ...v, title: v.title || null }, { tx });
    await linkImages(tx, ctx, OWNER, row.id, photoIds);
    return row;
  });
}

export async function updateEntry(ctx: Ctx, id: string, version: number, input: unknown) {
  const { photoIds, ...v } = parse(entryInput, input);
  if (empty({ ...v, photoIds })) throw new AppError("VALIDATION_FAILED", "내용을 적어 주세요");
  await checkTopic(ctx, v.topicId);
  return db.transaction(async (tx) => {
    const row = await entryRepo.update(ctx, id, version, { ...v, title: v.title || null }, { tx });
    await linkImages(tx, ctx, OWNER, id, photoIds);
    return row;
  });
}

/** 한 달 글 + 사진 */
export async function monthEntries(ctx: Ctx, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
  const [y, m] = month.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const rows = await entryRepo.list(ctx, { where: and(gte(journalEntries.date, `${month}-01`), lt(journalEntries.date, next)), orderBy: [desc(journalEntries.date), desc(journalEntries.createdAt)] });
  const photos = await imagesOf(
    ctx,
    OWNER,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ id: r.id, version: r.version, date: r.date, topicId: r.topicId, title: r.title, bodyMd: r.bodyMd, photos: photos.get(r.id) ?? [] }));
}

export async function entryWithPhotos(ctx: Ctx, id: string) {
  const r = await entryRepo.get(ctx, id);
  const photos = await imagesOf(ctx, OWNER, [id]);
  return { id: r.id, version: r.version, date: r.date, topicId: r.topicId, title: r.title, bodyMd: r.bodyMd, photos: photos.get(id) ?? [] };
}

/** 최근 글 n개(날짜 순) + 첫 사진 — 홈 "최근 기록" */
export async function recentEntries(ctx: Ctx, n: number) {
  const rows = await entryRepo.list(ctx, { orderBy: [desc(journalEntries.date), desc(journalEntries.createdAt)], limit: n });
  const photos = await imagesOf(
    ctx,
    OWNER,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ id: r.id, date: r.date, topicId: r.topicId, title: r.title, bodyMd: r.bodyMd, cover: photos.get(r.id)?.[0]?.id ?? null }));
}
