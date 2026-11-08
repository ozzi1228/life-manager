// 기록 · 일기 목록 (SCR-JRN-01): 최신 → 옛날 순으로 쭉(무한 스크롤), 날짜 없는 글은 맨 끝. 검색어(?q=)·분류(?topic=)·기간(?from=&to=, 최대 3년)으로 거름
// 검색어·분류는 모든 해에서 찾음. 기간 창의 길이만 3년까지
import { CalendarRange, PenLine, Search, X } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { JournalFeed } from "@/components/journal/journal-feed";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { entryPage, journalRange, RANGE_YEARS, topicList } from "@/server/journal";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 60);
  const topics = await topicList(ctx);
  const topic = typeof sp.topic === "string" && (sp.topic === "none" || topics.some((t) => t.id === sp.topic)) ? sp.topic : null;
  const range = journalRange(sp.from, sp.to);
  const finding = !!q || !!topic || !!range;
  const first = await entryPage(ctx, { q, topic, offset: 0, range });

  const href = (t: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (t) p.set("topic", t);
    if (range) {
      p.set("from", range.from);
      p.set("to", range.to);
    }
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
        {/* 검색어·기간을 한 폼으로(검색 칸에서 Enter, 또는 기간의 '찾기') */}
        <form action="/records" role="search" className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input name="q" type="search" defaultValue={q} placeholder="일기 검색 (제목·본문)" aria-label="일기 검색" className="h-11 pl-9 text-base md:h-9 md:text-sm" />
            </div>
            {write}
          </div>
          {topic && <input type="hidden" name="topic" value={topic} />}
          <details open={!!range} className="group">
            <summary className="text-muted-foreground hover:text-foreground inline-flex h-8 cursor-pointer list-none items-center gap-1.5 text-sm max-md:h-10 [&::-webkit-details-marker]:hidden">
              <CalendarRange className="size-4" />
              {range ? `${range.from} ~ ${range.to}` : "기간으로 찾기"}
            </summary>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5 pt-1 md:max-w-md">
              <Input name="from" type="date" defaultValue={range?.from} aria-label="시작일" className="h-11 px-2 text-base md:h-9 md:text-sm" />
              <span className="text-muted-foreground">~</span>
              <Input name="to" type="date" defaultValue={range?.to} aria-label="종료일" className="h-11 px-2 text-base md:h-9 md:text-sm" />
              <Button type="submit" variant="outline" className="max-md:h-11">
                찾기
              </Button>
              <p className="text-muted-foreground col-span-full text-caption">기간은 {RANGE_YEARS}년까지 고를 수 있어요. 한쪽만 고르면 {RANGE_YEARS}년 범위로 찾아요</p>
            </div>
          </details>
        </form>
        {range?.cut && <p className="text-warning-text text-caption">기간은 {RANGE_YEARS}년까지라 {range.from} ~ {range.to}로 줄였어요</p>}
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
            <X className="size-4" /> 검색·분류·기간 지우기
          </Link>
        )}
      </div>

      {first.items.length ? (
        // 검색·분류가 바뀌면 처음부터 다시
        <JournalFeed key={`${q}|${topic}|${range?.from}|${range?.to}`} first={first.items} more={first.more} q={q} topic={topic} range={range && { from: range.from, to: range.to }} topics={topics.map((t) => ({ id: t.id, name: t.name, colorHex: t.colorHex }))} today={today} />
      ) : finding ? (
        <EmptyState pet="hoya" title="찾는 일기가 없어요" description={range ? "기간에 날짜 없는 글은 들어가지 않아요. 다른 말·분류·기간으로 찾아보세요." : "다른 말로 찾아보거나 분류를 바꿔 보세요."} />
      ) : (
        <EmptyState pet="hoya" title="아직 쓴 일기가 없어요" description="하루를 짧게라도 남겨 보세요." action={write} />
      )}
    </Page>
  );
}
