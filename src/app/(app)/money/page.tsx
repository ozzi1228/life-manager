// 자산 · 한눈에 (SCR-FIN-01, 04 §6.1): 남은 예산(없으면 쓴 돈) → 7일 안 결제 예정 → 분류별 상위 5 → 최근 지출. 참은 소비는 M-22에서
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { InfoTip } from "@/components/app/help";
import { BudgetBar } from "@/components/app/money";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { AddExpenseButton } from "@/components/money/controls";
import { MoneyTabs } from "@/components/money/money-tabs";
import { TxList } from "@/components/money/tx-list";
import { Button } from "@/components/ui/button";
import { money, soonLabel } from "@/lib/format";
import { budgetView } from "@/server/budget";
import { monthTransactions, nameMaps, todayIn, totals, toRow } from "@/server/finance";
import { upcoming } from "@/server/recurring";
import { pageCtx } from "@/server/session";

const card = "bg-card space-y-3 rounded-xl border p-5 shadow-sm";

export default async function MoneyHome() {
  const ctx = await pageCtx();
  const today = todayIn();
  const month = today.slice(0, 7);
  const m = Number(month.slice(5));
  const [rows, names, soon, view] = await Promise.all([monthTransactions(ctx, month), nameMaps(ctx), upcoming(ctx), budgetView(ctx, month)]);
  const sum = totals(rows);
  const s = view.summary;
  const hasBudget = !!view.budget || view.planned.length > 0;

  // 분류별 지출(환불 차감) 상위 5개. 분류별 예산이 있으면 "쓴 돈 / 예산"
  const byCat = new Map<string, number>();
  for (const r of rows) if (r.type === "expense") byCat.set(r.categoryId, (byCat.get(r.categoryId) ?? 0) + (r.isRefund ? -r.amount : r.amount));
  const top = [...byCat].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = top[0]?.[1] ?? 1;
  const lines = view.budget?.lines ?? {};

  return (
    <Page>
      <MoneyTabs />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={card}>
          {hasBudget ? (
            <>
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">{m}월 {s.left >= 0 ? "남은 예산" : "예산 초과"}</p>
                <InfoTip label="예산 계산 방식">예산 = 분류별 예산 + 이번 달 큰 지출 + 고정 지출. 남은 예산 = 예산 − 쓴 돈(오늘까지, 환불 뺀 금액)</InfoTip>
              </div>
              <p className={s.left < 0 ? "text-display text-destructive-text flex items-center gap-2 font-bold tabular-nums" : "text-display font-bold tabular-nums"}>
                {s.left < 0 && <CircleAlert className="size-7" aria-hidden />}
                {money(Math.abs(s.left))}
              </p>
              <p className="text-muted-foreground text-sm tabular-nums">
                {money(s.total)} 중 {money(s.spent)} 썼어요
              </p>
              <BudgetBar used={s.spent} planned={s.scheduled} budget={s.total} label={`${m}월 예산 사용`} compact />
              <Button asChild variant="link" size="sm" className="-ml-3">
                <Link href="/money/budget">예산 자세히</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">{m}월에 쓴 돈</p>
              <p className="text-display font-bold tabular-nums">{money(sum.expense)}</p>
              {sum.income > 0 && <p className="text-muted-foreground text-sm tabular-nums">수입 {money(sum.income)}</p>}
              <p className="text-muted-foreground text-sm">예산을 정하면 남은 돈을 알려 드려요</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/money/budget">예산 정하기</Link>
              </Button>
            </>
          )}
        </section>

        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="text-subtitle font-semibold">7일 안 결제 예정</h2>
            <Button asChild variant="link" size="sm">
              <Link href="/money/fixed">고정 지출</Link>
            </Button>
          </div>
          {soon.length ? (
            <ul className="space-y-1.5">
              {soon.map((u) => (
                <li key={u.id + u.date} className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-20 shrink-0">{soonLabel(u.date, today)}</span>
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
          ) : (
            <p className="text-muted-foreground text-sm">7일 안에 나갈 고정 지출이 없어요</p>
          )}
        </section>

        {rows.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState title="이번 달 지출이 아직 없어요" description="결제하고 바로 기록하면 15초면 끝나요." action={<AddExpenseButton />} pet="pomong" />
          </div>
        ) : (
          <>
            <section className={`${card} lg:self-start`}>
              <h2 className="text-subtitle font-semibold">분류별</h2>
              <ul className="space-y-2.5">
                {top.map(([id, v]) => {
                  const line = lines[id];
                  return (
                    <li key={id} className="space-y-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span>{names.categories[id]}</span>
                        <span className={line !== undefined && v > line ? "text-destructive-text tabular-nums" : "tabular-nums"}>
                          {money(v)}
                          {line !== undefined && <span className="text-muted-foreground"> / {money(line)}</span>}
                        </span>
                      </div>
                      {line !== undefined ? (
                        <BudgetBar used={v} budget={line} label={`${names.categories[id]} 예산 사용`} compact />
                      ) : (
                        <div className="bg-muted h-2 overflow-hidden rounded-full">
                          <div className="bg-chart-1 h-full rounded-full" style={{ width: `${(v / maxCat) * 100}%` }} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-subtitle font-semibold">최근 지출</h2>
                <Button asChild variant="link" size="sm">
                  <Link href="/money/expenses">전체 보기</Link>
                </Button>
              </div>
              <TxList rows={rows.slice(0, 5).map(toRow)} categories={names.categories} payments={names.payments} today={today} />
            </section>
          </>
        )}
      </div>
    </Page>
  );
}
