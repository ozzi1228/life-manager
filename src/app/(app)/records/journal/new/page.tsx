// 일기 쓰기 (SCR-JRN-03)
import { EntryEditor } from "@/components/journal/entry-editor";
import { topicList } from "@/server/journal";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function NewEntryPage({ searchParams }: PageProps<"/records/journal/new">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const topics = await topicList(ctx);
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : today;
  return <EntryEditor key={date} entry={undefined} topics={topics.map((t) => ({ id: t.id, name: t.name, colorHex: t.colorHex }))} today={date} />;
}
