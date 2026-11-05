"use server";

// 작업 기록 되돌리기 (D-077). 규칙은 src/server/activity.ts
import { undoActivity } from "@/server/activity";
import { action } from "@/server/api";

export async function undoAction(key: string) {
  return action((ctx) => undoActivity(ctx, key));
}
