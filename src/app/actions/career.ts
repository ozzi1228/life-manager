"use server";

// 커리어: 경험 정리·문서 버전 (규칙은 src/server/career.ts)
import { action } from "@/server/api";
import { addExpCategory, createDoc, createExp, removeExpCategory, renameExpCategory, reorderExpCategories, setExpCategory, expRepo, removeDoc, saveVersion, updateDoc, updateExp, versionRepo, type DocInput, type ExpInput, type VersionInput } from "@/server/career";
import { once } from "@/server/idempotency";

export async function addExperience(key: string, input: ExpInput) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `exp:${key}`, JSON.stringify(input), async () => ({ status: 201, body: { id: (await createExp(ctx, input)).id } }));
    return body as { id: string };
  });
}
export async function editExperience(id: string, version: number, input: ExpInput) {
  return action(async (ctx) => ({ version: (await updateExp(ctx, id, version, input)).version }));
}
export async function deleteExperience(id: string) {
  return action(async (ctx) => {
    await expRepo.remove(ctx, id);
  });
}
export async function addDoc(input: DocInput) {
  return action(async (ctx) => ({ id: (await createDoc(ctx, input)).id }));
}
export async function editDoc(id: string, version: number, input: DocInput) {
  return action(async (ctx) => {
    await updateDoc(ctx, id, version, input);
  });
}
export async function deleteDoc(id: string) {
  return action((ctx) => removeDoc(ctx, id));
}
export async function saveDocVersion(docId: string, id: string | null, version: number | null, input: VersionInput) {
  return action(async (ctx) => ({ id: (await saveVersion(ctx, docId, id, version, input)).id }));
}
export async function deleteDocVersion(id: string) {
  return action(async (ctx) => {
    await versionRepo.remove(ctx, id);
  });
}
// 분류 편집
export async function addExpCat(name: string) {
  return action((ctx) => addExpCategory(ctx, name));
}
export async function renameExpCat(from: string, to: string) {
  return action((ctx) => renameExpCategory(ctx, from, to));
}
export async function removeExpCat(name: string) {
  return action((ctx) => removeExpCategory(ctx, name));
}
export async function reorderExpCats(names: string[]) {
  return action((ctx) => reorderExpCategories(ctx, names));
}
export async function setExpCat(name: string, patch: { color?: string | null; sections?: string[] }) {
  return action((ctx) => setExpCategory(ctx, name, patch));
}
