// 리뷰(기록 > 리뷰): 주제 글타래 + 그 안에 이어 다는 후기. 달글처럼 한 주제에 후기가 계속 쌓임
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { uuidv7 } from "../db/id.ts";
import { db } from "../db/index.ts";
import { reviewPosts, reviewThreads } from "../db/schema.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const threadRepo = defineRepo(reviewThreads, "review_thread");
export const postRepo = defineRepo(reviewPosts, "review_post");

const threadInput = z.object({
  title: z.string().trim().min(1, "제목을 적어 주세요").max(100, "제목은 100자까지 쓸 수 있어요"),
  memo: z
    .string()
    .trim()
    .max(200, "설명은 200자까지 쓸 수 있어요")
    .nullish()
    .transform((v) => v || null),
});
const postBody = z.string().trim().min(1, "후기를 적어 주세요").max(5000, "후기는 5000자까지 쓸 수 있어요");

/** 글타래 목록: 최근에 후기가 달린(없으면 만든) 순. 후기 수·마지막 후기 앞부분 함께 */
export async function threadList(ctx: Ctx) {
  const live = and(eq(reviewPosts.userId, ctx.userId), isNull(reviewPosts.deletedAt), eq(reviewPosts.threadId, reviewThreads.id));
  const rows = await db
    .select({
      id: reviewThreads.id,
      version: reviewThreads.version,
      title: reviewThreads.title,
      memo: reviewThreads.memo,
      createdAt: reviewThreads.createdAt,
      count: sql<number>`(select count(*)::int from ${reviewPosts} where ${live})`,
      lastAt: sql<Date | null>`(select max(${reviewPosts.createdAt}) from ${reviewPosts} where ${live})`,
      last: sql<string | null>`(select left(${reviewPosts.body}, 120) from ${reviewPosts} where ${live} order by ${reviewPosts.createdAt} desc limit 1)`,
    })
    .from(reviewThreads)
    .where(and(eq(reviewThreads.userId, ctx.userId), isNull(reviewThreads.deletedAt)))
    .orderBy(sql`coalesce((select max(${reviewPosts.createdAt}) from ${reviewPosts} where ${live}), ${reviewThreads.createdAt}) desc`)
    .limit(500);
  return rows.map((r) => ({ ...r, lastAt: r.lastAt ? new Date(r.lastAt) : null }));
}

export async function threadWithPosts(ctx: Ctx, id: string) {
  const t = await threadRepo.get(ctx, id);
  const posts = await postRepo.list(ctx, { where: eq(reviewPosts.threadId, id), orderBy: [asc(reviewPosts.createdAt)], limit: 5000 });
  return { id: t.id, version: t.version, title: t.title, memo: t.memo, posts: posts.map((p) => ({ id: p.id, body: p.body, createdAt: p.createdAt })) };
}

export const createThread = (ctx: Ctx, input: unknown) => threadRepo.create(ctx, parse(threadInput, input));
export const updateThread = (ctx: Ctx, id: string, version: number, input: unknown) => threadRepo.update(ctx, id, version, parse(threadInput, input));

/** 글타래 지우기: 후기도 같은 묶음으로(휴지통에서 함께 되살아남) */
export async function deleteThread(ctx: Ctx, id: string) {
  await threadRepo.get(ctx, id);
  const posts = await postRepo.list(ctx, { where: eq(reviewPosts.threadId, id), limit: 5000 });
  const batchId = uuidv7();
  await db.transaction(async (tx) => {
    await threadRepo.remove(ctx, id, { batchId, tx });
    for (const p of posts) await postRepo.remove(ctx, p.id, { batchId, tx });
  });
}

export async function addPost(ctx: Ctx, threadId: string, body: unknown) {
  await threadRepo.get(ctx, threadId); // 내 글타래인지
  return postRepo.create(ctx, { threadId, body: parse(postBody, body) });
}

export async function removePost(ctx: Ctx, id: string) {
  await postRepo.get(ctx, id);
  await postRepo.remove(ctx, id);
}
