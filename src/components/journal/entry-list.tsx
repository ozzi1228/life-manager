// 일기 목록 (SCR-JRN-01 1차): 날짜별 묶음, 주제·제목·본문 앞부분·사진. 누르면 고치기
import Link from "next/link";
import { dayLabel, fromYmd } from "@/lib/format";
import type { Entry } from "./entry-editor";

type Topic = { id: string; name: string; colorHex: string };

export function EntryList({ entries, topics, today }: { entries: Entry[]; topics: Topic[]; today: string }) {
  const days = new Map<string, Entry[]>();
  for (const e of entries) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  const topic = (id: string | null) => topics.find((t) => t.id === id);
  return (
    <div className="space-y-6">
      {[...days].map(([date, list]) => (
        <section key={date} className="space-y-2">
          <h3 className="text-muted-foreground text-sm">{dayLabel(date, fromYmd(today))}</h3>
          <ul className="space-y-2">
            {list.map((e) => {
              const t = topic(e.topicId);
              const first = e.bodyMd.trim().split("\n")[0] ?? "";
              return (
                <li key={e.id}>
                  <Link href={`/records/journal/${e.id}`} className="bg-card hover:bg-accent/40 block space-y-2 rounded-xl border p-4">
                    {t && (
                      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-caption">
                        <span className="size-2 rounded-full" style={{ background: t.colorHex }} /> {t.name}
                      </span>
                    )}
                    <p className="font-semibold">{e.title || first || "사진"}</p>
                    {e.bodyMd.trim() && <p className="text-muted-foreground line-clamp-2 text-sm whitespace-pre-line">{e.title ? e.bodyMd : e.bodyMd.trim().split("\n").slice(1).join("\n")}</p>}
                    {e.photos.length > 0 && (
                      <div className="flex gap-1.5">
                        {e.photos.slice(0, 4).map((p) => (
                          // eslint-disable-next-line @next/next/no-img-element -- 본인만 보는 사진(이 서버가 직접 보냄)
                          <img key={p.id} src={`/api/v1/attachments/${p.id}?v=thumb`} alt="" loading="lazy" className="size-16 rounded-md object-cover" />
                        ))}
                        {e.photos.length > 4 && <span className="text-muted-foreground self-end text-caption">+{e.photos.length - 4}</span>}
                      </div>
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
