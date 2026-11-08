// 기록 · 일기 목록 (SCR-JRN-01): 달별로 보기. 검색어(?q=)나 분류(?topic=)를 고르면 모든 달에서 찾음
import { PenLine, Search, X } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { EntryList } from "@/components/journal/entry-list";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { MonthNav } from "@/components/money/controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { monthEntries, searchEntries, topicList, undatedEntries } from "@/server/journal";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 60);
  const topics = await topicList(ctx);
  const topic = typeof sp.topic === "string" && (sp.topic === "none" || topics.some((t) => t.id === sp.topic)) ? sp.topic : null;
  const finding = !!q || !!topic;

  // 날짜 없는 글은 달별 보기에서 어느 달에서나 맨 위에
  const entries = finding ? await searchEntries(ctx, { q, topic }) : await Promise.all([undatedEntries(ctx), monthEntries(ctx, month)]).then(([u, d]) => [...u, ...d]);

  const href = (t: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (t) p.set("topic", t);
    if (!q && !t) p.set("month", month);
    return `/records?${p}`;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        {finding ? <p className="text-sm font-medium">{entries.length >= 300 ? "최근 300편" : `${entries.length}편`} 찾았어요</p> : <MonthNav month={month} />}
        {write}
      </div>

      <div className="space-y-2">
        <form action="/records" role="search" className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input name="q" type="search" defaultValue={q} placeholder="일기 검색 (제목·본문)" aria-label="일기 검색" className="h-11 pl-9 text-base md:h-9 md:text-sm" />
          {topic && <input type="hidden" name="topic" value={topic} />}
        </form>
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
          <Link href={`/records?month=${month}`} className="text-muted-foreground hover:text-foreground inline-flex h-8 items-center gap-1 text-sm">
            <X className="size-4" /> 검색·분류 지우고 달별로 보기
          </Link>
        )}
      </div>

      {entries.length ? (
        <EntryList entries={entries} topics={topics.map((t) => ({ id: t.id, name: t.name, colorHex: t.colorHex }))} today={today} />
      ) : finding ? (
        <EmptyState pet="hoya" title="찾는 일기가 없어요" description="다른 말로 찾아보거나 분류를 바꿔 보세요." />
      ) : (
        <EmptyState pet="hoya" title="이 달의 일기가 아직 없어요" description="하루를 짧게라도 남겨 보세요." action={write} />
      )}
    </Page>
  );
}
