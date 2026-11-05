// 위시 (SCR-WISH-01): 갖고 싶은 물건·보고 싶은 작품을 한 목록에. 분류는 이름만
import { Page } from "@/components/app/page-shell";
import { WishView } from "@/components/wish/wish";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";
import { wishList } from "@/server/wish";
import { categoryList } from "@/server/item-categories";

export default async function WishPage() {
  const ctx = await pageCtx();
  const categories = await categoryList(ctx); // 먼저: 처음이면 기본 분류를 만듦
  return (
    <Page>
      <WishView items={await wishList(ctx)} categories={categories} today={todayIn()} />
    </Page>
  );
}
