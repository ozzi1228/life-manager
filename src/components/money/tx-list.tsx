"use client";

// 지출 목록 (SCR-FIN-02, 04 §6.2): 날짜별 묶음 · 행 = 분류·내용 / 결제수단 / 금액. 행을 누르면 수정
import { StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useExpenseDialog, type TxEdit } from "@/components/money/expense-dialog";
import { dayLabel, fromYmd, money } from "@/lib/format";

export type TxRow = TxEdit;
type Names = Record<string, string>;

const signed = (r: TxRow) => (r.type === "income" || r.isRefund ? r.amount : -r.amount);

export function TxList({ rows, categories, payments, today }: { rows: TxRow[]; categories: Names; payments: Names; today: string }) {
  const openExpense = useExpenseDialog();
  const days = new Map<string, TxRow[]>();
  for (const r of rows) days.set(r.date, [...(days.get(r.date) ?? []), r]);

  return (
    <div className="space-y-5">
      {[...days].map(([date, list]) => {
        const sum = list.reduce((a, r) => a + signed(r), 0);
        return (
          <section key={date} aria-label={dayLabel(date, fromYmd(today))}>
            <h3 className="bg-background/95 text-muted-foreground sticky top-14 z-[1] flex justify-between py-1.5 text-sm backdrop-blur">
              <span>{dayLabel(date, fromYmd(today))}</span>
              <span className="tabular-nums">{sum > 0 ? `+${money(sum)}` : money(sum)}</span>
            </h3>
            <ul className="divide-y rounded-lg border">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => openExpense(r)} className="hover:bg-accent/50 flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left md:min-h-11">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{r.title || categories[r.categoryId] || "분류 없음"}</span>
                        {r.memo && <StickyNote className="text-muted-foreground size-3.5 shrink-0" aria-label="메모 있음" />}
                        {r.isRefund && <Badge variant="secondary">환불</Badge>}
                        {date > today && <Badge variant="outline">예정</Badge>}
                      </span>
                      <span className="text-muted-foreground block truncate text-caption">
                        {[r.title ? categories[r.categoryId] : null, r.paymentMethodId ? payments[r.paymentMethodId] : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {signed(r) > 0 ? `+${money(r.amount)}` : money(r.amount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
