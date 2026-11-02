// 목표 · 습관 트래커 (SCR-GOAL-02). 한 달 단위 항목 × 날짜 칸(D-069)
import { Page } from "@/components/app/page-shell";
import { GoalsTabs } from "@/components/goals/goals-tabs";
import { TrackerGrid } from "@/components/goals/tracker-grid";
import { trackerMonth } from "@/server/goals";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function HabitsPage({ searchParams }: PageProps<"/goals/habits">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? q.month : todayIn().slice(0, 7);
  const data = await trackerMonth(ctx, month);
  return (
    <Page>
      <GoalsTabs />
      <TrackerGrid data={data} />
    </Page>
  );
}
