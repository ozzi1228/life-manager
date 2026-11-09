// 기록 · 리뷰: 주제 글타래 목록(최근에 후기가 달린 순). 누르면 글타래 안에서 후기를 이어 닮
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { NewThreadButton } from "@/components/journal/review-thread";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { seoulWhen } from "@/lib/format";
import { threadList } from "@/server/reviews";
import { pageCtx } from "@/server/session";

export const metadata = { title: "리뷰 · 우나" };

export default async function ReviewsPage() {
  const ctx = await pageCtx();
  const threads = await threadList(ctx);
  return (
    <Page>
      <RecordsTabs />
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">주제 하나에 후기를 계속 이어 달아요</p>
        <NewThreadButton />
      </div>
      {threads.length ? (
        <ul className="bg-card divide-y rounded-xl border">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/records/reviews/${t.id}`} className="hover:bg-accent/40 block space-y-1 p-4">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.title}</span>
                  <span className="text-muted-foreground shrink-0 text-caption tabular-nums">후기 {t.count}</span>
                </span>
                {t.last ? (
                  <span className="text-muted-foreground line-clamp-2 block text-sm">{t.last}</span>
                ) : (
                  t.memo && <span className="text-muted-foreground block truncate text-sm">{t.memo}</span>
                )}
                {t.lastAt && <span className="text-muted-foreground block text-caption tabular-nums">마지막 후기 {seoulWhen(t.lastAt)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState pet="hoya" title="아직 리뷰 글타래가 없어요" description="'동네 카페', '올해 읽은 책'처럼 주제를 만들고 후기를 이어서 남겨 보세요." action={<NewThreadButton />} />
      )}
    </Page>
  );
}
