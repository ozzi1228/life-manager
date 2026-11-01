"use server";

// 일기 저장·삭제 (SCR-JRN-03). 규칙은 src/server/journal.ts
import { action } from "@/server/api";
import { once } from "@/server/idempotency";
import { createEntry, entryRepo, updateEntry } from "@/server/journal";
import { restore } from "@/server/repo";

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

export async function removeEntry(id: string) {
  return action(async (ctx) => {
    await entryRepo.remove(ctx, id);
  });
}

export async function restoreEntry(id: string) {
  return action((ctx) => restore(ctx, "journal_entry", id));
}
