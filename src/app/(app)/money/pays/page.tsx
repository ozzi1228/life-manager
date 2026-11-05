// 페이 목록 (06 §6.7): 네이버페이·카카오페이 등과 연결한 카드·계좌
import { Page } from "@/components/app/page-shell";
import { MoneyTabs, PaymentTabs } from "@/components/money/money-tabs";
import { PayGrid } from "@/components/money/pays";
import { payList, sourceOptions } from "@/server/cards";
import { pageCtx } from "@/server/session";

export default async function PaysPage() {
  const ctx = await pageCtx();
  const [pays, sources] = await Promise.all([payList(ctx), sourceOptions(ctx)]);
  return (
    <Page>
      <MoneyTabs />
      <PaymentTabs />
      <PayGrid pays={pays} sources={sources} />
    </Page>
  );
}
