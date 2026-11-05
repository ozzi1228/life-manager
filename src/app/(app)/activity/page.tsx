// 작업 기록 (D-077): 최근 90일 동안 한 추가·수정·삭제, 줄마다 되돌리기. 사이드바 아래
import { ActivityList } from "@/components/app/activity";
import { Page } from "@/components/app/page-shell";
import { activityList } from "@/server/activity";
import { pageCtx } from "@/server/session";

export default async function ActivityPage() {
  const ctx = await pageCtx();
  return (
    <Page narrow>
      <ActivityList items={await activityList(ctx)} />
    </Page>
  );
}
