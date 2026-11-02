// 기록 · 위시 (SCR-WISH-01): 쇼핑 / 작품(?tab=media)
import { Page } from "@/components/app/page-shell";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { WishView } from "@/components/wish/wish";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";
import { wishList } from "@/server/wish";

export default async function WishPage({ searchParams }: PageProps<"/records/wish">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  return (
    <Page>
      <RecordsTabs />
      <WishView items={await wishList(ctx)} today={todayIn()} initialTab={q.tab === "media" ? "media" : "shopping"} />
    </Page>
  );
}
