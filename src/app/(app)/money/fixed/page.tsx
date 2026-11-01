// 고정 지출 (SCR-FIN-06·07): 월 환산 합계, 다음 결제일 순 목록, 해지됨은 접어 둠
import { Page } from "@/components/app/page-shell";
import { MoneyTabs } from "@/components/money/money-tabs";
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
      <RecurringList
        items={items}
        categories={f.categories.filter((c) => c.kind === "expense").map(({ id, name }) => ({ id, name }))}
        payments={f.paymentMethods.map(({ id, name }) => ({ id, name }))}
        today={todayIn()}
      />
    </Page>
  );
}
