// 참은 소비 계산 (docs/planning/20 §3·4). 서버·화면·확인 스크립트 공용
// 참아야 할 금액 = "참아서 갚기" 체크한 지출(환불 차감) + 분류별 예산 초과액(예산 정한 분류만, 체크한 지출은 빼고 셈 — 이중 계산 방지)
//                + 지난달에서 넘어온 금액 + 참았다가 이번 달에 산 물건
// 오늘 이후 날짜(예정) 지출은 넣지 않음. 큰 지출 계획 초과도 넣지 않음(D-042)
export type RTx = { amount: number; isRefund: boolean; date: string; categoryId: string; restraint: boolean };
export type CategoryUse = { categoryId: string; budget: number; used: number };

export function restraintTarget(o: { txs: RTx[]; categories: CategoryUse[]; carriedIn: number; laterBought: number; today: string }) {
  const marked = o.txs.filter((t) => t.date <= o.today && t.restraint);
  const sum = (ts: RTx[]) => ts.reduce((a, t) => a + (t.isRefund ? -t.amount : t.amount), 0);
  const luxury = Math.max(0, sum(marked)); // 이름은 예전 그대로(정산 기록 detail.luxury)
  const overage = o.categories
    .map((c) => ({ categoryId: c.categoryId, over: c.used - sum(marked.filter((t) => t.categoryId === c.categoryId)) - c.budget }))
    .filter((c) => c.over > 0);
  const overageTotal = overage.reduce((a, c) => a + c.over, 0);
  return { luxury, overage, carriedIn: o.carriedIn, laterBought: o.laterBought, target: luxury + overageTotal + o.carriedIn + o.laterBought };
}
export type TargetDetail = ReturnType<typeof restraintTarget>;

/** 참을 것 없음 / 진행 중 / 달성 (20 §4.4). 넘친 금액은 다음 달로 넘기지 않음 */
export const fillState = (target: number, filled: number) => (target <= 0 ? "none" : filled >= target ? "done" : "progress");

