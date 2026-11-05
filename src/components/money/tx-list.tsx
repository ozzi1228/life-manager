"use client";

// 지출 목록 (SCR-FIN-02, 04 §6.2): 날짜별 묶음 · 행 = 제목 #태그 / 분류·결제수단 · 금액. 행을 누르면 수정
import { Badge } from "@/components/ui/badge";
import { useExpenseDialog, type TxEdit } from "@/components/money/expense-dialog";
import { dayLabel, fromYmd, money } from "@/lib/format";

export type TxRow = TxEdit;
type Names = Record<string, string>;

/** 결제수단 이름. 페이를 거쳤으면 "네이버페이 · 신한카드", 페이 머니면 "네이버페이 머니" */
export const payLabel = (r: Pick<TxRow, "paymentMethodId" | "payId">, payments: Names) => {
  const pm = r.paymentMethodId ? payments[r.paymentMethodId] : null;
  if (!r.payId || !payments[r.payId]) return pm;
  return r.payId === r.paymentMethodId ? `${payments[r.payId]} 머니` : [payments[r.payId], pm].filter(Boolean).join(" · ");
};

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
              <span className="tabular-nums">{sum > 0 ? `+${money(sum)}` : money(Math.abs(sum))}</span>
            </h3>
            <ul className="divide-y rounded-lg border">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => openExpense(r)} className="hover:bg-accent/50 flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left md:min-h-11">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{r.title || categories[r.categoryId] || "분류 없음"}</span>
                        {!!r.tags?.length && <span className="text-accent-foreground min-w-0 truncate text-caption">{r.tags.map((t) => `#${t}`).join(" ")}</span>}
                        {r.isRefund && <Badge variant="secondary">환불</Badge>}
                        {r.restraint && <Badge variant="outline">갚기</Badge>}
                        {date > today && <Badge variant="outline">예정</Badge>}
                      </span>
                      <span className="text-muted-foreground block truncate text-caption">
                        {[r.title ? categories[r.categoryId] : null, payLabel(r, payments)].filter(Boolean).join(" · ")}
                      </span>
                      {/* 메모가 있으면 첫 줄을 함께 */}
                      {r.memo && <span className="text-muted-foreground block truncate text-caption">{r.memo.split("\n")[0]}</span>}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {signed(r) > 0 ? `+${money(r.amount)}` : money(r.amount)}
                      {/* 외화로 쓴 돈: 원래 금액을 아래에 작게 */}
                      {r.foreignAmount && r.currency && <span className="text-muted-foreground block text-caption">{money(r.foreignAmount, { currency: r.currency })}</span>}
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
