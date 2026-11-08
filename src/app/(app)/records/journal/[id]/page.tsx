// 일기 글 보기 (SCR-JRN-02): 날짜·분류·제목·본문(글 사이 사진). 고치기는 "수정" 버튼으로 따로
import { ChevronLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { dateLabel, fromYmd } from "@/lib/format";
import { photoOf } from "@/lib/journal-body";
import { entryWithPhotos, topicList } from "@/server/journal";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function EntryPage({ params }: PageProps<"/records/journal/[id]">) {
  const { id } = await params;
  const ctx = await pageCtx();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [entry, topics] = await Promise.all([entryWithPhotos(ctx, id).catch(() => null), topicList(ctx)]);
  if (!entry) notFound();
  const topic = topics.find((t) => t.id === entry.topicId);

  // 본문: 글 줄은 이어서 한 덩어리, 사진 줄은 사진. 본문에 자리가 없는 사진(예전 일기)은 맨 아래
  const blocks: ({ text: string } | { photo: string })[] = [];
  for (const line of entry.bodyMd.split("\n")) {
    const p = photoOf(line);
    const last = blocks.at(-1);
    if (p) blocks.push({ photo: p });
    else if (last && "text" in last) last.text += `\n${line}`;
    else blocks.push({ text: line });
  }
  const placed = new Set(blocks.flatMap((b) => ("photo" in b ? [b.photo] : [])));
  for (const ph of entry.photos) if (!placed.has(ph.id)) blocks.push({ photo: ph.id });

  return (
    <article className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/records" className="text-muted-foreground hover:text-foreground -ml-2 inline-flex h-10 items-center gap-1 px-2 text-sm">
          <ChevronLeft className="size-4" />
          일기
        </Link>
        <Button variant="outline" asChild className="max-md:h-11">
          <Link href={`/records/journal/${entry.id}/edit`}>
            <Pencil /> 수정
          </Link>
        </Button>
      </div>
      <header className="space-y-1.5">
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span className="tabular-nums">{entry.date ? dateLabel(entry.date, fromYmd(todayIn())) : "날짜 없음"}</span>
          {topic && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: topic.colorHex }} /> {topic.name}
            </span>
          )}
        </p>
        {entry.title && <h1 className="text-title font-bold break-words">{entry.title}</h1>}
      </header>
      <div className="space-y-3 leading-relaxed">
        {blocks.map((b, i) =>
          "photo" in b ? (
            // eslint-disable-next-line @next/next/no-img-element -- 본인만 보는 사진(이 서버가 직접 보냄)
            <img key={i} src={`/api/v1/attachments/${b.photo}?v=body`} alt="" className="max-h-[70vh] max-w-full rounded-lg object-contain" />
          ) : (
            b.text.trim() && (
              <p key={i} className="break-words whitespace-pre-wrap">
                {b.text.replace(/^\n+|\n+$/g, "")}
              </p>
            )
          ),
        )}
      </div>
    </article>
  );
}
