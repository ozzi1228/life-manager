// 일기 고치기 (SCR-JRN-03)
import { notFound } from "next/navigation";
import { EntryEditor } from "@/components/journal/entry-editor";
import { entryWithPhotos, topicList } from "@/server/journal";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function EditEntryPage({ params }: PageProps<"/records/journal/[id]">) {
  const { id } = await params;
  const ctx = await pageCtx();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [entry, topics] = await Promise.all([entryWithPhotos(ctx, id).catch(() => null), topicList(ctx)]);
  if (!entry) notFound();
  return <EntryEditor entry={entry} topics={topics.map((t) => ({ id: t.id, name: t.name, colorHex: t.colorHex }))} today={todayIn()} />;
}
