// 기간별 > 월별·주간·일간 목표(D-072): /goals/month · /goals/week · /goals/day. key는 일정 기간 메모와 같음
import { notFound } from "next/navigation";
import { Page } from "@/components/app/page-shell";
import { GoalPeriodTabs, GoalsTabs } from "@/components/goals/goals-tabs";
import { PeriodGoalList } from "@/components/goals/period-goals";
import { periodKey } from "@/server/calendar";
import { goalCategoryList, periodGoalList } from "@/server/goals";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function GoalPeriodPage({ params }: PageProps<"/goals/[scope]">) {
  const { scope } = await params;
  if (scope !== "month" && scope !== "week" && scope !== "day") notFound();
  const ctx = await pageCtx();
  const today = todayIn();
  const [list, cats] = await Promise.all([periodGoalList(ctx, scope), goalCategoryList(ctx)]);
  return (
    <Page>
      <GoalsTabs />
      <GoalPeriodTabs />
      <PeriodGoalList scope={scope} goals={list} current={periodKey(scope, today)} thisYear={Number(today.slice(0, 4))} categories={cats.map((c) => ({ id: c.id, name: c.name }))} />
    </Page>
  );
}
