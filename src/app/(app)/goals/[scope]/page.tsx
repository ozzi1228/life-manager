// 기간별 > 월별·주간·일간 목표(D-072): /goals/month · /goals/week · /goals/day (?p=기간 key로 그 기간부터). key는 일정 기간 메모와 같음
import { notFound } from "next/navigation";
import { Page } from "@/components/app/page-shell";
import { GoalPeriodTabs, GoalsTabs } from "@/components/goals/goals-tabs";
import { PeriodGoalList } from "@/components/goals/period-goals";
import { periodKey } from "@/server/calendar";
import { goalCategoryList, periodGoalList } from "@/server/goals";
import { validPeriodKey } from "@/lib/period";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function GoalPeriodPage({ params, searchParams }: PageProps<"/goals/[scope]">) {
  const { scope } = await params;
  const { p } = await searchParams;
  if (scope !== "month" && scope !== "week" && scope !== "day") notFound();
  const ctx = await pageCtx();
  const today = todayIn();
  const current = periodKey(scope, today);
  const start = typeof p === "string" && validPeriodKey(scope, p) ? p : current; // ?p=기간: 일정 화면에서 그 기간으로
  const [list, cats] = await Promise.all([periodGoalList(ctx, scope), goalCategoryList(ctx)]);
  return (
    <Page>
      <GoalsTabs />
      <GoalPeriodTabs />
      <PeriodGoalList scope={scope} goals={list} current={current} start={start} thisYear={Number(today.slice(0, 4))} categories={cats.map((c) => ({ id: c.id, name: c.name }))} />
    </Page>
  );
}
