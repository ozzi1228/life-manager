"use server";

// 휴지통·보안 기록 (SCR-SET-09·10). 규칙은 src/server/trash.ts·security.ts
import { action } from "@/server/api";
import { securityLog } from "@/server/security";
import { purge, restoreBatch, trashView } from "@/server/trash";

export async function restoreTrash(entity: string, id: string) {
  return action((ctx) => restoreBatch(ctx, entity, id));
}
export async function purgeTrash(batchIds: string[]) {
  return action(async (ctx) => ({ purged: await purge(ctx, batchIds.slice(0, 500)) }));
}
/** 휴지통 비우기: 지금 목록의 모든 묶음 */
export async function emptyTrash() {
  return action(async (ctx) => ({ purged: await purge(ctx, (await trashView(ctx)).map((t) => t.batchId)) }));
}
export async function moreSecurityLog(before: string) {
  return action((ctx) => securityLog(ctx, before));
}
