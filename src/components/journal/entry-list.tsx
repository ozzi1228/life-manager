// 일기 목록 (SCR-JRN-01): 날짜별 묶음(날짜 없는 글은 "날짜 없음" 한 묶음). 한 줄 = 분류·제목·본문 앞부분(왼쪽) + 첫 사진(오른쪽). 블로그 글 목록처럼 화면 폭을 다 씀. 누르면 고치기
import Link from "next/link";
import { dayLabel, fromYmd } from "@/lib/format";
import { textOnly } from "@/lib/journal-body";
import type { Entry } from "./entry-editor";

type Topic = { id: string; name: string; colorHex: string };

export function EntryList({ entries, topics, today }: { entries: Entry[]; topics: Topic[]; today: string }) {
  const days = new Map<string, Entry[]>();
  for (const e of entries) days.set(e.date ?? "", [...(days.get(e.date ?? "") ?? []), e]);
  const topic = (id: string | null) => topics.find((t) => t.id === id);
  return (
    <div className="space-y-6">
      {[...days].map(([date, list]) => (
        <section key={date || "undated"} className="space-y-2">
          <h3 className="text-muted-foreground text-sm">{date ? dayLabel(date, fromYmd(today)) : "날짜 없음"}</h3>
          <ul className="bg-card divide-y rounded-xl border">
            {list.map((e) => {
              const t = topic(e.topicId);
              const text = textOnly(e.bodyMd);
              const [first = "", ...rest] = text.split("\n");
              const cover = e.photos[0];
              return (
                <li key={e.id}>
                  <Link href={`/records/journal/${e.id}`} className="hover:bg-accent/40 flex items-start gap-4 p-4">
                    <span className="min-w-0 flex-1 space-y-1">
                      {t && (
                        <span className="text-muted-foreground flex items-center gap-1.5 text-caption">
                          <span className="size-2 rounded-full" style={{ background: t.colorHex }} /> {t.name}
                        </span>
                      )}
                      <span className="block truncate font-semibold">{e.title || first || "사진"}</span>
                      {(e.title ? text : rest.join("\n").trim()) && <span className="text-muted-foreground line-clamp-2 text-sm whitespace-pre-line">{e.title ? text : rest.join("\n").trim()}</span>}
                    </span>
                    {cover && (
                      <span className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 본인만 보는 사진(이 서버가 직접 보냄) */}
                        <img src={`/api/v1/attachments/${cover.id}?v=thumb`} alt="" loading="lazy" className="size-16 rounded-lg object-cover md:size-20" />
                        {e.photos.length > 1 && <span className="bg-foreground/70 text-background absolute right-1 bottom-1 rounded px-1 text-caption tabular-nums">+{e.photos.length - 1}</span>}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
