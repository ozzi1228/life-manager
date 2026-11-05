// 가계부 내역 검색·필터·통계 (SCR-FIN-02). 주소 → 필터, 결과 → 통계. 서버·화면·확인 스크립트 공용
import { addMonths } from "./format.ts";
import { addDays } from "./recurring.ts";

export type TxType = "all" | "expense" | "income"; // 환불은 따로 안 봄(돌려받은 돈은 수입으로 적음. 예전 환불은 '모두'에)
export type Period = "month" | "3m" | "year" | "all" | "range";
export type TxFilter = {
  q: string;
  period: Period;
  month: string;
  from?: string;
  to?: string;
  type: TxType;
  cats: string[];
  pms: string[];
  tags: string[];
  min?: number;
  max?: number;
  restraint: boolean;
  show: number;
};

type Raw = Record<string, string | string[] | undefined>;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: Raw[string]) => (Array.isArray(v) ? v[0] : v);
const many = (v: Raw[string]) => [v ?? []].flat();
const amount = (v: Raw[string]) => {
  const n = Number(one(v));
  return one(v) && Number.isInteger(n) && n >= 0 ? n : undefined;
};
export const lastDay = (ym: string) => addDays(`${addMonths(ym, 1)}-01`, -1);

/** 주소(?q=&period=&month=&from=&to=&type=&cat=&pm=&tag=&min=&max=&restraint=1&show=)를 필터로. 이상한 값은 버림 */
export function readFilter(sp: Raw, today: string): TxFilter {
  const m = one(sp.month);
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7);
  let period = (["3m", "year", "all", "range"].includes(one(sp.period) ?? "") ? one(sp.period) : "month") as Period;
  let [from, to] = [one(sp.from), one(sp.to)].map((d) => (d && YMD.test(d) ? d : undefined));
  if (period === "range" && !(from && to)) period = "month";
  if (period === "range" && from! > to!) [from, to] = [to, from];
  if (period === "month") [from, to] = [`${month}-01`, lastDay(month)];
  if (period === "3m") [from, to] = [`${addMonths(today.slice(0, 7), -2)}-01`, lastDay(today.slice(0, 7))];
  if (period === "year") [from, to] = [`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`];
  if (period === "all") [from, to] = [undefined, undefined];
  const t = one(sp.type);
  let [min, max] = [amount(sp.min), amount(sp.max)];
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  return {
    q: (one(sp.q) ?? "").trim().slice(0, 60),
    period,
    month,
    from,
    to,
    type: t === "expense" || t === "income" ? t : "all",
    cats: many(sp.cat).filter((x) => UUID.test(x)).slice(0, 50),
    pms: many(sp.pm).filter((x) => UUID.test(x)).slice(0, 50),
    tags: many(sp.tag).map((x) => x.trim()).filter(Boolean).slice(0, 20),
    min,
    max,
    restraint: one(sp.restraint) === "1",
    show: Math.min(Math.max(Number(one(sp.show)) || 200, 200), 5000),
  };
}

/** 필터 버튼에 붙는 개수(검색어·기간·종류 빼고) */
export const filterCount = (f: TxFilter) => f.cats.length + f.pms.length + f.tags.length + (f.min !== undefined || f.max !== undefined ? 1 : 0) + (f.restraint ? 1 : 0);

export type STx = { type: "expense" | "income"; amount: number; isRefund: boolean; restraint: boolean; date: string; categoryId: string; paymentMethodId: string | null; tags: string[] };
export type Part = { key: string; amount: number; count: number };

/**
 * 결과 통계. 지출은 환불을 빼고 셈. 결과가 모두 수입이면 수입 기준(kind)으로 나눔·흐름을 냄
 * 지출 기준일 때도 수입이 섞여 있으면 흐름에 수입(income)을, 수입 분류별(incomeByCategory)을 따로 냄
 * 흐름: 기간이 62일 이하면 날짜별, 넘으면 달별. 빈 날·달도 0으로 채움
 */
export function txStats<T extends STx>(rows: T[], from?: string, to?: string) {
  let expense = 0;
  let income = 0;
  let refund = 0;
  let restraint = 0;
  for (const r of rows) {
    if (r.type === "income") income += r.amount;
    else {
      const v = r.isRefund ? -r.amount : r.amount;
      expense += v;
      if (r.isRefund) refund += r.amount;
      if (r.restraint) restraint += v;
    }
  }
  const kind: "expense" | "income" = rows.length && rows.every((r) => r.type === "income") ? "income" : "expense";
  const focus = rows.filter((r) => r.type === kind);
  const plain = focus.filter((r) => !r.isRefund);
  const total = kind === "income" ? income : expense;
  const value = (r: T) => (r.isRefund ? -r.amount : r.amount);

  const group = (keys: (r: T) => string[], list = focus) => {
    const m = new Map<string, Part>();
    for (const r of list)
      for (const key of keys(r)) {
        const p = m.get(key) ?? { key, amount: 0, count: 0 };
        p.amount += value(r);
        if (!r.isRefund) p.count++;
        m.set(key, p);
      }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  };

  // 흐름
  const dates = focus.map((r) => r.date).sort();
  const start = from ?? dates[0];
  const end = to ?? dates.at(-1);
  const trend: { unit: "day" | "month"; points: (Part & { income: number })[] } = { unit: "day", points: [] };
  const incomes = kind === "expense" ? rows.filter((r) => r.type === "income") : [];
  if (start && end) {
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    trend.unit = days > 62 ? "month" : "day";
    const keyOf = (d: string) => (trend.unit === "month" ? d.slice(0, 7) : d);
    const sums = new Map<string, Part & { income: number }>();
    for (let k = keyOf(start); k <= keyOf(end); k = trend.unit === "month" ? addMonths(k, 1) : addDays(k, 1)) sums.set(k, { key: k, amount: 0, count: 0, income: 0 });
    for (const r of focus) {
      const p = sums.get(keyOf(r.date));
      if (!p) continue;
      p.amount += value(r);
      if (!r.isRefund) p.count++;
    }
    for (const r of incomes) {
      const p = sums.get(keyOf(r.date));
      if (p) p.income += r.amount;
    }
    trend.points = [...sums.values()];
  }

  return {
    kind,
    expense,
    income,
    refund,
    restraint,
    total,
    count: rows.length,
    avg: plain.length ? Math.round(total / plain.length) : 0,
    top: [...plain].sort((a, b) => b.amount - a.amount).slice(0, 3),
    byCategory: group((r) => [r.categoryId]),
    incomeByCategory: group((r) => [r.categoryId], incomes),
    byPayment: group((r) => [r.paymentMethodId ?? ""]),
    byTag: group((r) => (r.tags.length ? r.tags : [""])),
    trend,
  };
}
export type TxStats<T extends STx = STx> = ReturnType<typeof txStats<T>>;
