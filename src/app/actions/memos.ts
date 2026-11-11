"use server";

// 메모 저장·삭제. 규칙은 src/server/memos.ts
import { action } from "@/server/api";
import { createMemo, deleteMemo, updateMemo } from "@/server/memos";

type MemoIn = { title: string; body: string };

export async function addMemoAction(input: MemoIn) {
  return action(async (ctx) => ({ id: (await createMemo(ctx, input)).id }));
}
export async function editMemoAction(id: string, version: number, input: MemoIn) {
  return action(async (ctx) => ({ version: (await updateMemo(ctx, id, version, input)).version }));
}
export async function removeMemoAction(id: string) {
  return action((ctx) => deleteMemo(ctx, id));
}
