"use server";

// 일기 저장·삭제 (SCR-JRN-03). 규칙은 src/server/journal.ts
import { action } from "@/server/api";
import { once } from "@/server/idempotency";
import { addTopic, colorTopic, createEntry, entryRepo, removeTopic, renameTopic, reorderTopics, updateEntry } from "@/server/journal";

type EntryIn = { date: string; topicId: string | null; title: string | null; bodyMd: string; photoIds: string[] };

export async function addEntry(key: string, input: EntryIn) {
  return action(async (ctx) => {
    const { body } = await once(ctx.userId, `journal:${key}`, JSON.stringify(input), async () => ({ status: 201, body: { id: (await createEntry(ctx, input)).id } }));
    return body as { id: string };
  });
}

export async function editEntry(id: string, version: number, input: EntryIn) {
  return action(async (ctx) => ({ version: (await updateEntry(ctx, id, version, input)).version }));
}

// ── 일기 분류 편집(분류 편집 창) ──
export async function addTopicAction(name: string) {
  return action(async (ctx) => void (await addTopic(ctx, name)));
}
export async function renameTopicAction(id: string, name: string) {
  return action(async (ctx) => void (await renameTopic(ctx, id, name)));
}
export async function colorTopicAction(id: string, hex: string) {
  return action(async (ctx) => void (await colorTopic(ctx, id, hex)));
}
export async function removeTopicAction(id: string) {
  return action((ctx) => removeTopic(ctx, id));
}
export async function reorderTopicsAction(ids: string[]) {
  return action((ctx) => reorderTopics(ctx, ids));
}

export async function removeEntry(id: string) {
  return action(async (ctx) => {
    await entryRepo.remove(ctx, id);
  });
}

