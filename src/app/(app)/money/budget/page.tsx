// 월별 예산 (SCR-FIN-04·05): 총예산·쓴 돈·남은 돈, 고정 지출(자동), 큰 지출, 분류별 예산
import { Page } from "@/components/app/page-shell";
import { BudgetView } from "@/components/money/budget-view";
import { MoneyTabs } from "@/components/money/money-tabs";
import { budgetView, lastMonthActual } from "@/server/budget";
import { formData, todayIn } from "@/server/finance";
import { pageCtx } from "@/server/session";

export default async function BudgetPage({ searchParams }: PageProps<"/money/budget">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? q.month : today.slice(0, 7);
  const [view, f, lastActual] = await Promise.all([budgetView(ctx, month), formData(ctx), lastMonthActual(ctx, month)]);
  return (
    <Page>
      <MoneyTabs />
      <BudgetView view={view} categories={f.categories.filter((c) => c.kind === "expense").map(({ id, name }) => ({ id, name }))} lastActual={lastActual} today={today} />
    </Page>
  );
}
