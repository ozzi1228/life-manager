// 메모(기록 > 메모): 제목 + 내용 하나짜리 글. 삼성노트처럼 목록 → 눌러서 쓰기·고치기
import { desc } from "drizzle-orm";
import { z } from "zod";
import { memos } from "../db/schema.ts";
import { AppError } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const memoRepo = defineRepo(memos, "memo");

const memoInput = z.object({
  title: z.string().trim().max(100, "제목은 100자까지 쓸 수 있어요"),
  body: z.string().max(20000, "내용은 20000자까지 쓸 수 있어요"),
});

function check(input: unknown) {
  const v = parse(memoInput, input);
  if (!v.title && !v.body.trim()) throw new AppError("VALIDATION_FAILED", "제목이나 내용을 적어 주세요");
  return v;
}

export const memoList = (ctx: Ctx) => memoRepo.list(ctx, { orderBy: [desc(memos.updatedAt)], limit: 1000 });
export const getMemo = (ctx: Ctx, id: string) => memoRepo.get(ctx, id);
export const createMemo = async (ctx: Ctx, input: unknown) => memoRepo.create(ctx, check(input));
export const updateMemo = async (ctx: Ctx, id: string, version: number, input: unknown) => memoRepo.update(ctx, id, version, check(input));
export async function deleteMemo(ctx: Ctx, id: string) {
  await memoRepo.get(ctx, id);
  await memoRepo.remove(ctx, id);
}
