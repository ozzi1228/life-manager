// 메모 하나 보기·고치기
import { notFound } from "next/navigation";
import { MemoEditor } from "@/components/memos/memo-editor";
import { seoulWhen } from "@/lib/format";
import { getMemo } from "@/server/memos";
import { pageCtx } from "@/server/session";

export const metadata = { title: "메모 · 우나" };

export default async function MemoPage({ params }: PageProps<"/records/memos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await pageCtx();
  const m = await getMemo(ctx, id).catch(() => null);
  if (!m) notFound();
  return <MemoEditor key={m.id} memo={{ id: m.id, version: m.version, title: m.title, body: m.body }} when={`고친 때 ${seoulWhen(m.updatedAt)}`} />;
}
