// 지출 목록 (SCR-FIN-02): 검색·필터·태그(주소 ?q=&period=&tag=…), 결과 요약·통계. 행을 누르면 수정
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { AddExpenseButton } from "@/components/money/controls";
import { ExpenseTabs, MoneyTabs } from "@/components/money/money-tabs";
import { TxResults } from "@/components/money/tx-results";
import { TxSearch } from "@/components/money/tx-search";
import { filterCount, readFilter, txStats } from "@/lib/tx-search";
import { formData, nameMaps, SEARCH_LIMIT, searchTransactions, todayIn, toRow } from "@/server/finance";
import { pageCtx } from "@/server/session";

export default async function ExpensesPage({ searchParams }: PageProps<"/money/expenses">) {
  const ctx = await pageCtx();
  const today = todayIn();
  const f = readFilter(await searchParams, today);
  const [rows, names, opts] = await Promise.all([searchTransactions(ctx, f), nameMaps(ctx), formData(ctx)]);
  const stats = txStats(rows.map(toRow), f.from, f.to);
  const narrowed = !!f.q || f.type !== "all" || filterCount(f) > 0;

  return (
    <Page>
      <MoneyTabs />
      <ExpenseTabs />
      <TxSearch f={f} today={today} options={{ categories: opts.categories, payments: opts.paymentMethods, tags: opts.tags }} />
      {rows.length ? (
        <TxResults rows={rows.slice(0, f.show).map(toRow)} stats={stats} categories={names.categories} payments={names.payments} today={today} capped={rows.length >= SEARCH_LIMIT} />
      ) : narrowed ? (
        <EmptyState title="조건에 맞는 내역이 없어요" description="검색어나 필터를 바꿔 보세요" pet="pomong" />
      ) : (
        <EmptyState title={f.period === "month" ? "이번 달 지출이 아직 없어요" : "이 기간 지출이 아직 없어요"} action={<AddExpenseButton />} pet="pomong" />
      )}
    </Page>
  );
}
