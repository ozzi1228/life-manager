// 계좌 목록 (06 §7): 종류(입출금·예금·적금·주식)별 정보, 연결된 카드, 자동 결제
import { Page } from "@/components/app/page-shell";
import { AccountGrid } from "@/components/money/accounts";
import { MoneyTabs, PaymentTabs } from "@/components/money/money-tabs";
import { accountList } from "@/server/cards";
import { todayIn } from "@/server/finance";
import { pageCtx } from "@/server/session";

export default async function AccountsPage() {
  const ctx = await pageCtx();
  return (
    <Page>
      <MoneyTabs />
      <PaymentTabs />
      <AccountGrid accounts={await accountList(ctx)} today={todayIn()} />
    </Page>
  );
}
