// 월별 예산 계산 (docs/planning/06 §4.1·4.2). 날짜는 "YYYY-MM-DD", 금액은 원
// 예산(총) = 고정 지출 합계 + 큰 지출 합계 + 분류별 예산 합계
// 쓴 돈 = 오늘까지의 지출(환불 차감). 미래 날짜는 "예정"으로 따로
// 분류 사용 = 그 분류 지출 중 큰 지출에 연결되지 않은 것. 같은 돈이 두 번 잡히지 않게
export type BudgetTx = { type: string; amount: number; isRefund: boolean; date: string; categoryId: string; plannedExpenseId: string | null };
export type Planned = { id: string; name: string; amount: number; manuallyDone: boolean };
export type Status = "ok" | "warn" | "over";

/** 80% 미만 여유, 100% 미만 주의, 그 이상 초과(예산 0원에 쓴 돈이 있으면 초과) */
export const statusOf = (used: number, budget: number): Status => (used > budget || (budget === 0 && used > 0) ? "over" : budget > 0 && used / budget >= 0.8 ? "warn" : "ok");

const signed = (t: BudgetTx) => (t.isRefund ? -t.amount : t.amount);

export function summarize(o: { lines: Record<string, number>; planned: Planned[]; fixed: number; txs: BudgetTx[]; today: string }) {
  const live = new Set(o.planned.map((p) => p.id));
  const exp = o.txs.filter((t) => t.type === "expense");
  const past = exp.filter((t) => t.date <= o.today);
  const spent = past.reduce((a, t) => a + signed(t), 0);
  const scheduled = exp.filter((t) => t.date > o.today).reduce((a, t) => a + signed(t), 0);

  const byCat = new Map<string, number>();
  for (const t of past) if (!(t.plannedExpenseId && live.has(t.plannedExpenseId))) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + signed(t));

  const categories = Object.entries(o.lines).map(([categoryId, budget]) => {
    const used = byCat.get(categoryId) ?? 0;
    return { categoryId, budget, used, left: budget - used, status: statusOf(used, budget) };
  });
  const noBudget = [...byCat].filter(([c, v]) => !(c in o.lines) && v > 0).map(([categoryId, used]) => ({ categoryId, used }));

  const planned = o.planned.map((p) => {
    const used = past.filter((t) => t.plannedExpenseId === p.id).reduce((a, t) => a + signed(t), 0);
    const state = used > p.amount ? "over" : p.manuallyDone || used === p.amount ? "done" : used > 0 ? "partial" : "none";
    return { ...p, used, state: state as "none" | "partial" | "done" | "over" };
  });

  const linesSum = Object.values(o.lines).reduce((a, b) => a + b, 0);
  const plannedSum = o.planned.reduce((a, p) => a + p.amount, 0);
  const total = o.fixed + plannedSum + linesSum;
  return { total, fixed: o.fixed, plannedSum, linesSum, spent, scheduled, left: total - spent, status: statusOf(spent, total), categories, noBudget, planned };
}

/** 지난달 실제 지출로 채우기: 분류별 사용을 1,000원 단위로 올림 */
export const fromActual = (used: { categoryId: string; used: number }[]) =>
  Object.fromEntries(used.filter((u) => u.used > 0).map((u) => [u.categoryId, Math.ceil(u.used / 1000) * 1000]));
