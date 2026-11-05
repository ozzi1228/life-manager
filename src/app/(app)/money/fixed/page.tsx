// 고정 수입·지출 (SCR-FIN-06·07): 금융 > 가계부 탭 안. 월 환산 합계(나가는 돈·들어오는 돈), 다음 날짜 순 목록, 해지됨은 접어 둠
import { Page } from "@/components/app/page-shell";
import { ExpenseTabs, MoneyTabs } from "@/components/money/money-tabs";
import { RecurringList } from "@/components/money/recurring-list";
import { formData, todayIn } from "@/server/finance";
import { recurringList } from "@/server/recurring";
import { pageCtx } from "@/server/session";

export default async function FixedPage() {
  const ctx = await pageCtx();
  const [items, f] = await Promise.all([recurringList(ctx), formData(ctx)]);
  return (
    <Page>
      <MoneyTabs />
      <ExpenseTabs />
      <RecurringList
        items={items}
        categories={f.categories.map(({ id, name, kind }) => ({ id, name, kind }))}
        payments={f.paymentMethods.map(({ id, name }) => ({ id, name }))}
        today={todayIn()}
      />
    </Page>
  );
}
