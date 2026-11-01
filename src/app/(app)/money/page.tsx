// 자산 · 한눈에 (SCR-FIN-01): 이번 달 쓴 돈·수입, 7일 안 결제 예정, 분류별 상위, 최근 지출. 예산·참은 소비는 3묶음에서
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { AddExpenseButton } from "@/components/money/controls";
import { MoneyTabs } from "@/components/money/money-tabs";
import { TxList } from "@/components/money/tx-list";
import { Button } from "@/components/ui/button";
import { dayLabel, fromYmd, money } from "@/lib/format";
import { monthTransactions, nameMaps, todayIn, totals, toRow } from "@/server/finance";
import { upcoming } from "@/server/recurring";
import { pageCtx } from "@/server/session";

export default async function MoneyHome() {
  const ctx = await pageCtx();
  const today = todayIn();
  const month = today.slice(0, 7);
  const [rows, names, soon] = await Promise.all([monthTransactions(ctx, month), nameMaps(ctx), upcoming(ctx)]);
  const sum = totals(rows);

  // 분류별 지출(환불 차감) 상위 5개
  const byCat = new Map<string, number>();
  for (const r of rows) if (r.type === "expense") byCat.set(r.categoryId, (byCat.get(r.categoryId) ?? 0) + (r.isRefund ? -r.amount : r.amount));
  const top = [...byCat].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = top[0]?.[1] ?? 1;

  return (
    <Page>
      <MoneyTabs />
      {soon.length > 0 && (
        <section className="bg-card space-y-2 rounded-xl border p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-subtitle font-semibold">7일 안 결제 예정</h2>
            <Button asChild variant="link" size="sm">
              <Link href="/money/fixed">고정 지출</Link>
            </Button>
          </div>
          <ul className="space-y-1.5">
            {soon.map((u) => (
              <li key={u.id + u.date} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-20 shrink-0">{upLabel(u.date, today)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {u.name}
                  {u.memo && <span className="text-muted-foreground"> · {u.memo.split("\n")[0]}</span>}
                </span>
                <span className="shrink-0 tabular-nums">
                  {u.variableAmount && "약 "}
                  {money(u.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows.length === 0 ? (
        <EmptyState title="이번 달 지출이 아직 없어요" description="결제하고 바로 기록하면 15초면 끝나요." action={<AddExpenseButton />} pet="pomong" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="bg-card space-y-2 rounded-xl border p-5 shadow-sm">
            <p className="text-muted-foreground text-sm">{Number(month.slice(5))}월에 쓴 돈</p>
            <p className="text-display font-bold tabular-nums">{money(sum.expense)}</p>
            {sum.income > 0 && <p className="text-muted-foreground text-sm tabular-nums">수입 {money(sum.income)}</p>}
            <p className="text-muted-foreground text-caption">예산을 정하면 남은 돈을 알려 드려요(곧 열려요)</p>
          </section>

          <section className="bg-card space-y-3 rounded-xl border p-5 shadow-sm">
            <h2 className="text-subtitle font-semibold">분류별</h2>
            <ul className="space-y-2.5">
              {top.map(([id, v]) => (
                <li key={id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{names.categories[id]}</span>
                    <span className="tabular-nums">{money(v)}</span>
                  </div>
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div className="bg-chart-1 h-full rounded-full" style={{ width: `${(v / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-subtitle font-semibold">최근 지출</h2>
              <Button asChild variant="link" size="sm">
                <Link href="/money/expenses">전체 보기</Link>
              </Button>
            </div>
            <TxList rows={rows.slice(0, 5).map(toRow)} categories={names.categories} payments={names.payments} today={today} />
          </section>
        </div>
      )}
    </Page>
  );
}

// 오늘·내일·모레, 그 뒤는 날짜
function upLabel(d: string, today: string) {
  const diff = Math.round((fromYmd(d).getTime() - fromYmd(today).getTime()) / 86_400_000);
  return diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === 2 ? "모레" : dayLabel(d, fromYmd(today));
}
