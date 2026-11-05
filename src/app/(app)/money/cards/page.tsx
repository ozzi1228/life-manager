// 카드 목록 (SCR-FIN-08, D-071): 내 카드와 메모, 결제 계좌
import { Page } from "@/components/app/page-shell";
import { CardGrid } from "@/components/money/cards";
import { MoneyTabs, PaymentTabs } from "@/components/money/money-tabs";
import { cardList, sourceOptions } from "@/server/cards";
import { pageCtx } from "@/server/session";

export default async function CardsPage() {
  const ctx = await pageCtx();
  const [cards, sources] = await Promise.all([cardList(ctx), sourceOptions(ctx)]);
  return (
    <Page>
      <MoneyTabs />
      <PaymentTabs />
      <CardGrid cards={cards} accounts={sources.filter((s) => s.kind === "account")} />
    </Page>
  );
}
