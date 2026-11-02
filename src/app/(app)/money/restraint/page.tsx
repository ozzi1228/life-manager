// 참은 소비 (SCR-FIN-14): ?month= 로 지난 달 정산 결과
import { Page } from "@/components/app/page-shell";
import { MoneyTabs } from "@/components/money/money-tabs";
import { RestraintView } from "@/components/money/restraint";
import { restraintView } from "@/server/restraint";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function RestraintPage({ searchParams }: PageProps<"/money/restraint">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? q.month : today.slice(0, 7);
  return (
    <Page>
      <MoneyTabs />
      <RestraintView v={await restraintView(ctx, month)} today={today} />
    </Page>
  );
}
