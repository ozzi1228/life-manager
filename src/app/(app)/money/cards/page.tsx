// 카드 목록 (SCR-FIN-08, D-071): 내 카드와 메모
import { Page } from "@/components/app/page-shell";
import { CardGrid } from "@/components/money/cards";
import { MoneyTabs } from "@/components/money/money-tabs";
import { cardList } from "@/server/cards";
import { pageCtx } from "@/server/session";

export default async function CardsPage() {
  const ctx = await pageCtx();
  return (
    <Page>
      <MoneyTabs />
      <CardGrid cards={await cardList(ctx)} />
    </Page>
  );
}
