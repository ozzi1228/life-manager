// 기록 · 작품 (SCR-MED-01): 포스터 캘린더·목록
import { Page } from "@/components/app/page-shell";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { MediaView } from "@/components/media/media";
import { mediaList } from "@/server/media";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function MediaPage() {
  const ctx = await pageCtx();
  return (
    <Page>
      <RecordsTabs />
      <MediaView items={await mediaList(ctx)} today={todayIn()} />
    </Page>
  );
}
