// 연도별(새해) 목표 (SCR-GOAL-08): 기간에 그 해가 든 목표
import { Page } from "@/components/app/page-shell";
import { GoalList } from "@/components/goals/goal-list";
import { GoalsTabs } from "@/components/goals/goals-tabs";
import { goalCategoryList, goalList, toGoal } from "@/server/goals";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function GoalYearPage({ searchParams }: PageProps<"/goals/year">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const thisYear = Number(todayIn().slice(0, 4));
  const y = Number(q.y);
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : thisYear;
  const [list, cats] = await Promise.all([goalList(ctx), goalCategoryList(ctx)]);
  return (
    <Page>
      <GoalsTabs />
      <GoalList goals={list.map(toGoal)} categories={cats.map((c) => ({ id: c.id, name: c.name }))} year={year} thisYear={thisYear} />
    </Page>
  );
}
