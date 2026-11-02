// 연도별(새해) 목표 (SCR-GOAL-08): 기간에 그 해가 든 목표. 모든 해를 한 화면에 이어서(D-069). 월·주·일 목표는 각 탭에서(D-072)
import { Page } from "@/components/app/page-shell";
import { GoalList } from "@/components/goals/goal-list";
import { GoalPeriodTabs, GoalsTabs } from "@/components/goals/goals-tabs";
import { goalCategoryList, goalList, toGoal } from "@/server/goals";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function GoalYearPage() {
  const ctx = await pageCtx();
  const [list, cats] = await Promise.all([goalList(ctx, true), goalCategoryList(ctx)]);
  return (
    <Page>
      <GoalsTabs />
      <GoalPeriodTabs />
      <GoalList goals={list.map(toGoal)} categories={cats.map((c) => ({ id: c.id, name: c.name }))} view="years" thisYear={Number(todayIn().slice(0, 4))} />
    </Page>
  );
}
