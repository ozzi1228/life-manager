// 전체 목표 (SCR-GOAL-05). 목표 영역 첫 탭(D-069)
import { Page } from "@/components/app/page-shell";
import { GoalList } from "@/components/goals/goal-list";
import { GoalsTabs } from "@/components/goals/goals-tabs";
import { goalCategoryList, goalList, toGoal } from "@/server/goals";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function GoalsPage() {
  const ctx = await pageCtx();
  const [list, cats] = await Promise.all([goalList(ctx), goalCategoryList(ctx)]);
  return (
    <Page>
      <GoalsTabs />
      <GoalList goals={list.map(toGoal)} categories={cats.map((c) => ({ id: c.id, name: c.name }))} thisYear={Number(todayIn().slice(0, 4))} />
    </Page>
  );
}
