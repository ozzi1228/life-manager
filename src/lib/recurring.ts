// 고정 지출 주기·결제일 계산 (docs/planning/06 §5.2). 날짜는 "YYYY-MM-DD"(시간대 없음)
// - 매월 N일·말일: 그 달에 없는 날(31일)은 그 달 말일
// - 매년 M월 N일: 2월 29일은 평년에 2월 28일
// - N개월마다: 시작 달부터 N개월 간격
// - 매주 요일
// 주말·공휴일 이동(카드사 규칙)은 반영하지 않음 — "약속된 날" 기준
export type Rule =
  | { cycle: "monthly"; dayOfMonth: number } // 0 = 말일
  | { cycle: "yearly"; monthOfYear: number; dayOfMonth: number }
  | { cycle: "every_n_months"; intervalMonths: number; anchorMonth: string; dayOfMonth: number }
  | { cycle: "weekly"; weekday: number }; // 0 = 일요일

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1~12
const day = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d === 0 ? lastDay(y, m) : Math.min(d, lastDay(y, m)))}`;
const parts = (s: string) => s.split("-").map(Number) as [number, number, number];
export const addDays = (s: string, n: number) => {
  const [y, m, d] = parts(s);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const monthIndex = (y: number, m: number) => y * 12 + (m - 1);

/** from(포함) 이후 첫 결제일 */
export function nextDate(r: Rule, from: string): string {
  const [y, m] = parts(from);
  switch (r.cycle) {
    case "monthly": {
      const here = day(y, m, r.dayOfMonth);
      return here >= from ? here : day(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, r.dayOfMonth);
    }
    case "yearly": {
      const here = day(y, r.monthOfYear, r.dayOfMonth);
      return here >= from ? here : day(y + 1, r.monthOfYear, r.dayOfMonth);
    }
    case "every_n_months": {
      const [ay, am] = r.anchorMonth.split("-").map(Number);
      const anchor = monthIndex(ay, am);
      let k = Math.max(0, Math.ceil((monthIndex(y, m) - anchor) / r.intervalMonths));
      for (;;) {
        const i = anchor + k * r.intervalMonths;
        const d = day(Math.floor(i / 12), (i % 12) + 1, r.dayOfMonth);
        if (d >= from) return d;
        k++;
      }
    }
    case "weekly": {
      const dow = new Date(`${from}T00:00:00Z`).getUTCDay();
      return addDays(from, (r.weekday - dow + 7) % 7);
    }
  }
}

/** from~to(둘 다 포함) 사이 결제일들 */
export function datesBetween(r: Rule, from: string, to: string) {
  const out: string[] = [];
  for (let d = nextDate(r, from); d <= to; d = nextDate(r, addDays(d, 1))) out.push(d);
  return out;
}

/** 월 환산 금액(목록 머리 합계, 06 §6.6) */
export function perMonth(amount: number, r: Rule) {
  if (r.cycle === "monthly") return amount;
  if (r.cycle === "yearly") return Math.round(amount / 12);
  if (r.cycle === "every_n_months") return Math.round(amount / r.intervalMonths);
  return Math.round((amount * 52) / 12);
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayText = (d: number) => (d === 0 ? "말일" : `${d}일`);

/** "매월 3일" · "매월 말일" · "매년 3월 2일" · "3개월마다 15일" · "매주 월요일" */
export function ruleLabel(r: Rule) {
  if (r.cycle === "monthly") return `매월 ${dayText(r.dayOfMonth)}`;
  if (r.cycle === "yearly") return `매년 ${r.monthOfYear}월 ${dayText(r.dayOfMonth)}`;
  if (r.cycle === "every_n_months") return `${r.intervalMonths}개월마다 ${dayText(r.dayOfMonth)}`;
  return `매주 ${WEEK[r.weekday]}요일`;
}
