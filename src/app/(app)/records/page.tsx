// 기록 · 일기 목록 (SCR-JRN-01)
import { PenLine } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { EntryList } from "@/components/journal/entry-list";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { MonthNav } from "@/components/money/controls";
import { Button } from "@/components/ui/button";
import { monthEntries, topicList } from "@/server/journal";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? q.month : today.slice(0, 7);
  const [entries, topics] = await Promise.all([monthEntries(ctx, month), topicList(ctx)]);
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
        <MonthNav month={month} />
        {write}
      </div>
      {entries.length ? (
        <EntryList entries={entries} topics={topics.map((t) => ({ id: t.id, name: t.name, colorHex: t.colorHex }))} today={today} />
      ) : (
        <EmptyState pet="hoya" title="이 달의 일기가 아직 없어요" description="하루를 짧게라도 남겨 보세요." action={write} />
      )}
    </Page>
  );
}
