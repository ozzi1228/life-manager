"use server";

// 작품 기록 추가·수정·삭제 (SCR-MED-01~03). 규칙은 src/server/media.ts
import { action } from "@/server/api";
import { once } from "@/server/idempotency";
import { createMedia, removeMedia, updateMedia, type MediaInput } from "@/server/media";

/** fromWish: 작품 위시에서 시작·완료 처리할 때(09 §7) */
export async function addMedia(key: string, input: MediaInput, fromWish?: { id: string; version: number }) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `media:${key}`, JSON.stringify({ input, fromWish }), async () => ({ status: 201, body: { id: (await createMedia(ctx, input, fromWish)).id } }));
    return body as { id: string };
  });
}
export async function editMedia(id: string, version: number, input: MediaInput) {
  return action(async (ctx) => ({ version: (await updateMedia(ctx, id, version, input)).version }));
}
export async function deleteMedia(id: string) {
  return action((ctx) => removeMedia(ctx, id));
}
