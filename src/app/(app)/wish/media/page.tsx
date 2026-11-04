// 위시 · 작품 (SCR-MED-01): 포스터 캘린더·목록
import { Page } from "@/components/app/page-shell";
import { WishTabs } from "@/components/wish/wish-tabs";
import { MediaView } from "@/components/media/media";
import { mediaList } from "@/server/media";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function MediaPage() {
  const ctx = await pageCtx();
  return (
    <Page>
      <WishTabs />
      <MediaView items={await mediaList(ctx)} today={todayIn()} />
    </Page>
  );
}
