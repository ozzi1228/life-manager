// 달성한 목표 모아 보기: 달성한 해별로(D-069)
import { Page } from "@/components/app/page-shell";
import { GoalList } from "@/components/goals/goal-list";
import { GoalsTabs } from "@/components/goals/goals-tabs";
import { goalCategoryList, goalList, toGoal } from "@/server/goals";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function GoalDonePage() {
  const ctx = await pageCtx();
  const [list, cats] = await Promise.all([goalList(ctx), goalCategoryList(ctx)]);
  return (
    <Page>
      <GoalsTabs />
      <GoalList goals={list.map(toGoal)} categories={cats.map((c) => ({ id: c.id, name: c.name }))} view="done" thisYear={Number(todayIn().slice(0, 4))} />
    </Page>
  );
}
