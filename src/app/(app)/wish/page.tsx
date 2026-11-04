// 위시 · 위시 (SCR-WISH-01): 쇼핑 / 작품(?tab=media)
import { Page } from "@/components/app/page-shell";
import { WishTabs } from "@/components/wish/wish-tabs";
import { WishView } from "@/components/wish/wish";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";
import { wishList } from "@/server/wish";
import { categoryList } from "@/server/item-categories";

export default async function WishPage({ searchParams }: PageProps<"/wish">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const categories = await categoryList(ctx, "wish"); // 먼저: 처음이면 기본 분류를 만들고 항목을 채움
  return (
    <Page>
      <WishTabs />
      <WishView items={await wishList(ctx)} categories={categories} today={todayIn()} initialTab={q.tab === "media" ? "media" : "shopping"} />
    </Page>
  );
}
