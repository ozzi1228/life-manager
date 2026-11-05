// 계좌 계산 (docs/planning/06 §7): 예금·적금 예상 이자(단리), 주식 수익. 화면 미리보기와 목록이 함께 씀
// ponytail: 단리·개월 수 기준. 은행마다 다른 일수 계산·복리는 반영하지 않음
export const ACCOUNT_CATEGORY = { checking: "입출금", deposit: "예금", savings: "적금", stock: "주식" } as const;
export type AccountCategory = keyof typeof ACCOUNT_CATEGORY;
export const TAX = { normal: { label: "일반 과세 15.4%", rate: 0.154 }, preferential: { label: "세금우대 9.5%", rate: 0.095 }, free: { label: "비과세", rate: 0 } } as const;
export type Tax = keyof typeof TAX;

/** 시작일부터 만기일까지 꽉 찬 개월 수 */
export function monthsBetween(start: string, end: string) {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

type Saving = { category: AccountCategory; principal: number | null; rate: number | null; tax: Tax | null; startDate: string | null; maturityDate: string | null };

/** 예금: 원금 × 이율 × 개월/12. 적금: 월 납입액 × 이율/12 × n(n+1)/2. 칸이 비면 null */
export function expectedInterest(a: Saving) {
  if ((a.category !== "deposit" && a.category !== "savings") || !a.principal || !a.rate || !a.startDate || !a.maturityDate) return null;
  const months = monthsBetween(a.startDate, a.maturityDate);
  if (!months) return null;
  const r = a.rate / 100;
  const gross = Math.floor(a.category === "deposit" ? (a.principal * r * months) / 12 : ((a.principal * r) / 12) * ((months * (months + 1)) / 2));
  const tax = Math.floor(gross * TAX[a.tax ?? "normal"].rate);
  const paid = a.category === "deposit" ? a.principal : a.principal * months;
  return { months, gross, tax, net: gross - tax, paid, total: paid + gross - tax };
}

/** 주식: 평가 금액 − 원금, 수익률(%) */
export function stockProfit(principal: number | null, balance: number | null) {
  if (!principal || balance === null) return null;
  return { profit: balance - principal, pct: Math.round(((balance - principal) / principal) * 1000) / 10 };
}

/** 만기까지 남은 날(지났으면 음수) */
export const daysUntil = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
