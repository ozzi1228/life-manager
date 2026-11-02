"use server";

// 참은 소비 기록·빼기·다시 정산 (SCR-FIN-14). 규칙은 src/server/restraint.ts
import { action } from "@/server/api";
import { once } from "@/server/idempotency";
import { restore } from "@/server/repo";
import { createRestraint, resettle, restraintEntryRepo, setExcluded, updateRestraint, type RestraintInput } from "@/server/restraint";

export async function addRestraint(key: string, input: RestraintInput) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `restraint:${key}`, JSON.stringify(input), async () => ({ status: 201, body: { id: (await createRestraint(ctx, input)).id } }));
    return body as { id: string };
  });
}
export async function editRestraint(id: string, version: number, input: RestraintInput) {
  return action(async (ctx) => ({ version: (await updateRestraint(ctx, id, version, input)).version }));
}
export async function excludeRestraint(id: string, version: number, excluded: boolean) {
  return action(async (ctx) => ({ version: (await setExcluded(ctx, id, version, excluded)).version }));
}
export async function deleteRestraint(id: string) {
  return action(async (ctx) => {
    await restraintEntryRepo.remove(ctx, id);
  });
}
export async function restoreRestraint(id: string) {
  return action((ctx) => restore(ctx, "restraint_entry", id));
}
export async function resettleMonth(month: string) {
  return action((ctx) => resettle(ctx, month));
}
