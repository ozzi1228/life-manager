"use server";

// 건강 기록 추가·수정·삭제 (SCR-HLT-01·02). 규칙은 src/server/health.ts
import { action } from "@/server/api";
import { createHealth, healthRepo, updateHealth, type HealthInput } from "@/server/health";
import { once } from "@/server/idempotency";
import { restore } from "@/server/repo";

export async function addHealth(key: string, input: HealthInput) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `health:${key}`, JSON.stringify(input), async () => ({ status: 201, body: { id: (await createHealth(ctx, input)).id } }));
    return body as { id: string };
  });
}
export async function editHealth(id: string, version: number, input: HealthInput) {
  return action(async (ctx) => {
    await updateHealth(ctx, id, version, input);
  });
}
export async function deleteHealth(id: string) {
  return action(async (ctx) => {
    await healthRepo.remove(ctx, id);
  });
}
export async function restoreHealth(id: string) {
  return action((ctx) => restore(ctx, "health_record", id));
}
