// 전체 검색 (상단 돋보기): ?q= 로 일기·일정·수입·지출·목표·메모·위시·커리어를 한 번에. 건강 기록은 빼고(암호화·검색 제외)
import { Search } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { Input } from "@/components/ui/input";
import { searchAll } from "@/server/search";
import { pageCtx } from "@/server/session";

export const metadata = { title: "검색 · 우나" };

/** 찾은 말을 굵게 */
function Mark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-primary/20 text-foreground rounded-sm">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 60);
  const ctx = await pageCtx();
  const groups = await searchAll(ctx, q);
  return (
    <Page>
      <form action="/search" role="search" className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input name="q" type="search" defaultValue={q} autoFocus={!q} placeholder="일기·일정·지출·목표·메모·위시·커리어에서 찾기" aria-label="전체 검색" className="h-12 pl-9 text-base" />
      </form>
      {!q ? (
        <p className="text-muted-foreground text-sm">찾을 말을 적고 Enter를 눌러 주세요. 건강 기록은 검색에 나오지 않아요.</p>
      ) : groups.length === 0 ? (
        <EmptyState pet="hoya" title={`'${q}'(으)로 찾은 게 없어요`} description="다른 말로 찾아보세요." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2" aria-label={g.label}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{g.label}</h2>
                {g.more && (
                  <Link href={g.more} className="text-muted-foreground hover:text-foreground text-sm">
                    더 보기
                  </Link>
                )}
              </div>
              <ul className="bg-card divide-y rounded-xl border">
                {g.hits.map((h) => (
                  <li key={h.id}>
                    <Link href={h.href} className="hover:bg-accent/40 block space-y-0.5 px-4 py-3">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          <Mark text={h.title} q={q} />
                        </span>
                        {h.sub && <span className="text-muted-foreground shrink-0 text-caption tabular-nums">{h.sub}</span>}
                      </span>
                      {h.snippet && (
                        <span className="text-muted-foreground line-clamp-2 block text-sm">
                          <Mark text={h.snippet} q={q} />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
