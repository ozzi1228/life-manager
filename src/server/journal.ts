// 일기 서비스 (docs/planning/08 §2, 15 §8)
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { uuidv7 } from "../db/id.ts";
import { db } from "../db/index.ts";
import { journalComments, journalEntries, journalTopics } from "../db/schema.ts";
import { GOAL_PALETTE } from "../lib/palette.ts";
import { AppError } from "./errors.ts";
import { imagesOf, linkImages } from "./files.ts";
import { dup } from "./finance.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { likePattern, parse } from "./validate.ts";

export const topicRepo = defineRepo(journalTopics, "journal_topic");
export const entryRepo = defineRepo(journalEntries, "journal_entry");
export const commentRepo = defineRepo(journalComments, "journal_comment");
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 선택해 주세요").nullable().default(null), // null = 날짜 없는 글
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

/** 일기 목록 한 쪽: 최신 날짜부터 옛날 순, 날짜 없는 글은 맨 끝. 검색어(제목·본문)·분류(id 또는 "none" = 분류 없음)로 거름
 * 무한 스크롤로 offset부터 PAGE개씩. ponytail: offset 방식 — 글이 수천 편 넘게 쌓여 느려지면 (date, created_at) 커서로 */
export const ENTRY_PAGE = 30;
export async function entryPage(ctx: Ctx, { q, topic, offset }: { q: string; topic: string | null; offset: number }) {
  const w = [
    q ? or(ilike(journalEntries.title, likePattern(q)), ilike(journalEntries.bodyMd, likePattern(q))) : undefined,
    topic === "none" ? isNull(journalEntries.topicId) : topic ? eq(journalEntries.topicId, topic) : undefined,
  ];
  const rows = await entryRepo.list(ctx, {
    where: and(...w),
    orderBy: [sql`${journalEntries.date} desc nulls last`, desc(journalEntries.createdAt), desc(journalEntries.id)],
    limit: ENTRY_PAGE + 1,
    offset: Math.max(0, Math.floor(offset)),
  });
  const page = rows.slice(0, ENTRY_PAGE);
  const photos = await imagesOf(
    ctx,
    OWNER,
    page.map((r) => r.id),
  );
  return { items: page.map((r) => ({ id: r.id, version: r.version, date: r.date, topicId: r.topicId, title: r.title, bodyMd: r.bodyMd, photos: photos.get(r.id) ?? [] })), more: rows.length > ENTRY_PAGE };
}

/** 일기 지우기: 댓글도 같은 묶음으로(휴지통에서 함께 되살아남) */
export async function deleteEntry(ctx: Ctx, id: string) {
  await entryRepo.get(ctx, id);
  const comments = await commentRepo.list(ctx, { where: eq(journalComments.entryId, id), limit: 5000 });
  const batchId = uuidv7();
  await db.transaction(async (tx) => {
    await entryRepo.remove(ctx, id, { batchId, tx });
    for (const c of comments) await commentRepo.remove(ctx, c.id, { batchId, tx });
  });
}

// ── 댓글: 나중의 내가 지난 일기에 다는 한마디. 단 때(created_at)를 함께 보여 줌 ──
const commentBody = z.string().trim().min(1, "댓글을 적어 주세요").max(2000, "댓글은 2000자까지 쓸 수 있어요");

export async function commentList(ctx: Ctx, entryId: string) {
  const rows = await commentRepo.list(ctx, { where: eq(journalComments.entryId, entryId), orderBy: [asc(journalComments.createdAt)], limit: 500 });
  return rows.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt }));
}

export async function addComment(ctx: Ctx, entryId: string, body: unknown) {
  await entryRepo.get(ctx, entryId); // 내 일기인지(지운 일기엔 못 닮)
  return commentRepo.create(ctx, { entryId, body: parse(commentBody, body) });
}

export async function removeComment(ctx: Ctx, id: string) {
  await commentRepo.get(ctx, id);
  await commentRepo.remove(ctx, id);
}

export async function entryWithPhotos(ctx: Ctx, id: string) {
  const r = await entryRepo.get(ctx, id);
  const photos = await imagesOf(ctx, OWNER, [id]);
  return { id: r.id, version: r.version, date: r.date, topicId: r.topicId, title: r.title, bodyMd: r.bodyMd, photos: photos.get(id) ?? [] };
}

/** 최근 글 n개(날짜 순) + 첫 사진 — 홈 "최근 기록" */
export async function recentEntries(ctx: Ctx, n: number) {
  // 날짜 없는 글은 쓴 날 기준으로 섞음
  const rows = await entryRepo.list(ctx, { orderBy: [desc(sql`coalesce(${journalEntries.date}, (${journalEntries.createdAt} at time zone 'Asia/Seoul')::date)`), desc(journalEntries.createdAt)], limit: n });
  const photos = await imagesOf(
    ctx,
    OWNER,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ id: r.id, date: r.date, topicId: r.topicId, title: r.title, bodyMd: r.bodyMd, cover: photos.get(r.id)?.[0]?.id ?? null }));
}
