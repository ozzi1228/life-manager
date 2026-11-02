// 카드 목록 (SCR-FIN-08): 이번 달 실적·남은 혜택 한도
import { Page } from "@/components/app/page-shell";
import { CardGrid } from "@/components/money/cards";
import { MoneyTabs } from "@/components/money/money-tabs";
import { cardList } from "@/server/cards";
import { formData, todayIn } from "@/server/finance";
import { pageCtx } from "@/server/session";

export default async function CardsPage() {
  const ctx = await pageCtx();
  const [list, f] = await Promise.all([cardList(ctx), formData(ctx)]);
  return (
    <Page>
      <MoneyTabs />
      <CardGrid cards={list.cards} noPayment={list.noPayment} categories={f.categories.filter((c) => c.kind === "expense").map(({ id, name }) => ({ id, name }))} today={todayIn()} />
    </Page>
  );
}
