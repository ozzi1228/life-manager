"use server";

// 리뷰 글타래·후기 저장·삭제. 규칙은 src/server/reviews.ts
import { action } from "@/server/api";
import { addPost, createThread, deleteThread, removePost, updateThread } from "@/server/reviews";

type ThreadIn = { title: string; memo: string | null };

export async function addThreadAction(input: ThreadIn) {
  return action(async (ctx) => ({ id: (await createThread(ctx, input)).id }));
}
export async function editThreadAction(id: string, version: number, input: ThreadIn) {
  return action(async (ctx) => ({ version: (await updateThread(ctx, id, version, input)).version }));
}
export async function removeThreadAction(id: string) {
  return action((ctx) => deleteThread(ctx, id));
}
export async function addPostAction(threadId: string, body: string) {
  return action(async (ctx) => ({ id: (await addPost(ctx, threadId, body)).id }));
}
export async function removePostAction(id: string) {
  return action((ctx) => removePost(ctx, id));
}
