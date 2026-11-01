// 지출 목록 (SCR-FIN-02): 달·종류로 보기, 행을 누르면 수정
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { AddExpenseButton, MonthNav, TypeFilter } from "@/components/money/controls";
import { MoneyTabs } from "@/components/money/money-tabs";
import { TxList } from "@/components/money/tx-list";
import { money } from "@/lib/format";
import { monthTransactions, nameMaps, todayIn, totals, toRow } from "@/server/finance";
import { pageCtx } from "@/server/session";

export default async function ExpensesPage({ searchParams }: PageProps<"/money/expenses">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? q.month : today.slice(0, 7);
  const type = q.type === "expense" || q.type === "income" ? q.type : "all";
  const [rows, names] = await Promise.all([monthTransactions(ctx, month, type === "all" ? undefined : type), nameMaps(ctx)]);
  const sum = totals(rows);

  return (
    <Page>
      <MoneyTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} />
        <div className="flex items-center gap-2">
          <TypeFilter value={type} />
          <span className="max-md:hidden">
            <AddExpenseButton />
          </span>
        </div>
      </div>
      <p className="text-muted-foreground text-sm tabular-nums">
        지출 {money(sum.expense)}
        {sum.income > 0 && ` · 수입 ${money(sum.income)}`}
      </p>
      {rows.length ? (
        <TxList rows={rows.map(toRow)} categories={names.categories} payments={names.payments} today={today} />
      ) : (
        <EmptyState title={type === "income" ? "이번 달 수입이 아직 없어요" : "이번 달 지출이 아직 없어요"} action={<AddExpenseButton />} pet="pomong" />
      )}
    </Page>
  );
}
