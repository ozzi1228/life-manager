// 기록 · 일기 목록 (SCR-JRN-01): 최신 → 옛날 순으로 쭉(무한 스크롤), 날짜 없는 글은 맨 끝. 검색어(?q=)·분류(?topic=)로 거름
import { PenLine, Search, X } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { JournalFeed } from "@/components/journal/journal-feed";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { entryPage, topicList } from "@/server/journal";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 60);
  const topics = await topicList(ctx);
  const topic = typeof sp.topic === "string" && (sp.topic === "none" || topics.some((t) => t.id === sp.topic)) ? sp.topic : null;
  const finding = !!q || !!topic;
  const first = await entryPage(ctx, { q, topic, offset: 0 });

  const href = (t: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (t) p.set("topic", t);
    return p.size ? `/records?${p}` : "/records";
  };
  const chip = (t: string | null, label: React.ReactNode) => (
    <Link
      key={t ?? "all"}
      href={href(t)}
      aria-current={topic === t ? "page" : undefined}
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm max-md:h-10", topic === t ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-accent")}
    >
      {label}
    </Link>
  );
  const write = (
    <Button asChild>
      <Link href="/records/journal/new">
        <PenLine /> 글 쓰기
      </Link>
    </Button>
  );

  return (
    <Page>
      <RecordsTabs />
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <form action="/records" role="search" className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input name="q" type="search" defaultValue={q} placeholder="일기 검색 (제목·본문)" aria-label="일기 검색" className="h-11 pl-9 text-base md:h-9 md:text-sm" />
            {topic && <input type="hidden" name="topic" value={topic} />}
          </form>
          {write}
        </div>
        <nav aria-label="분류" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {chip(null, "전체")}
          {topics.map((t) =>
            chip(
              t.id,
              <>
                <span className="size-2 rounded-full" style={{ background: t.colorHex }} /> {t.name}
              </>,
            ),
          )}
          {chip("none", "분류 없음")}
        </nav>
        {finding && (
          <Link href="/records" className="text-muted-foreground hover:text-foreground inline-flex h-8 items-center gap-1 text-sm">
            <X className="size-4" /> 검색·분류 지우기
          </Link>
        )}
      </div>

      {first.items.length ? (
        // 검색·분류가 바뀌면 처음부터 다시
        <JournalFeed key={`${q}|${topic}`} first={first.items} more={first.more} q={q} topic={topic} topics={topics.map((t) => ({ id: t.id, name: t.name, colorHex: t.colorHex }))} today={today} />
      ) : finding ? (
        <EmptyState pet="hoya" title="찾는 일기가 없어요" description="다른 말로 찾아보거나 분류를 바꿔 보세요." />
      ) : (
        <EmptyState pet="hoya" title="아직 쓴 일기가 없어요" description="하루를 짧게라도 남겨 보세요." action={write} />
      )}
    </Page>
  );
}
