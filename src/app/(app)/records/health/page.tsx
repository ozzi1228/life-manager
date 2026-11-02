// 기록 · 건강 (SCR-HLT-01): 체중·혈당. 최근 1년치를 불러와 화면에서 기간별로
import { Page } from "@/components/app/page-shell";
import { HealthView } from "@/components/health/health";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { healthList } from "@/server/health";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function HealthPage() {
  const ctx = await pageCtx();
  const today = todayIn();
  const since = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const [weight, glucose] = await Promise.all([healthList(ctx, "weight", since), healthList(ctx, "glucose", since)]);
  return (
    <Page>
      <RecordsTabs />
      <HealthView weight={weight} glucose={glucose} today={today} />
    </Page>
  );
}
