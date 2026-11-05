// 화면 표시 형식 (docs/planning/03 §9.4). 금액은 통화의 가장 작은 단위 정수(원·엔은 1, 달러·위안은 센트·펀). 기본은 원
// 주의: today를 생략하면 지금 시각을 읽음 → 클라이언트 컴포넌트의 렌더 중에는 today를 넘겨야 함(미리 그리는 화면에 날짜가 굳지 않게)
const won = new Intl.NumberFormat("ko-KR");

/** 고를 수 있는 통화. 더 필요하면 코드만 넣으면 됨(소수 자리는 Intl이 앎) */
export const CURRENCIES = { KRW: "원", USD: "미국 달러", JPY: "엔", CAD: "캐나다 달러", CNY: "위안", EUR: "유로", GBP: "파운드", AUD: "호주 달러", HKD: "홍콩 달러", TWD: "대만 달러", SGD: "싱가포르 달러", THB: "바트", VND: "동" } as const;
export type Currency = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as [Currency, ...Currency[]];

const fmts = new Map<string, Intl.NumberFormat>();
const fmtOf = (c: Currency) => {
  if (!fmts.has(c)) fmts.set(c, new Intl.NumberFormat("ko-KR", { style: "currency", currency: c }));
  return fmts.get(c)!;
};
/** 소수 자리: 원·엔 0, 달러·위안 2 */
export const decimals = (c: Currency) => fmtOf(c).resolvedOptions().maximumFractionDigits ?? 0;
/** 가장 작은 단위 정수 → 보이는 수(1250 USD → 12.5) */
export const toMajor = (n: number, c: Currency) => n / 10 ** decimals(c);

/** 12,000원 · US$12.50 · JP¥1,000. 수입·환불은 +50,000원(색이 아니라 부호로) */
export function money(n: number, o: { sign?: boolean; currency?: Currency } = {}) {
  const c = o.currency ?? "KRW";
  const s = c === "KRW" ? `${won.format(Math.abs(n))}원` : fmtOf(c).format(toMajor(Math.abs(n), c));
  return n < 0 ? `-${s}` : o.sign && n > 0 ? `+${s}` : s;
}

/** 통화를 바꿔도 보이는 숫자는 그대로(12,000원 → 12,000엔, 12원 → 12.00달러) */
export const rescale = (n: number | null, from: Currency, to: Currency) => (n === null ? null : Math.round(toMajor(n, from) * 10 ** decimals(to)));
/** 외화 → 원: 금액 × 1단위당 원, 반올림 */
export const toKrw = (n: number, c: Currency, rate: number) => Math.round(toMajor(n, c) * rate);
/** 저장된 두 금액에서 1단위당 원(소수 둘째 자리까지) */
export const rateOf = (krw: number, n: number, c: Currency) => Math.round((krw / toMajor(n, c)) * 100) / 100;

/** 들어온 돈은 빨강 +, 나간 돈은 파랑 −(색만으로 전하지 않게 부호도). 서버·화면 공용 */
export const signedMoney = (n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `-${money(-n)}` : money(0));
export const signClass = (n: number) => (n > 0 ? "text-red-600 dark:text-red-400" : n < 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground");

/** 위젯용 요약: 9,800원 · 1.2만원 · 230만원 · 1.5억원 */
export function moneyShort(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e8) return `${sign}${+(a / 1e8).toFixed(1)}억원`;
  if (a >= 1e6) return `${sign}${Math.round(a / 1e4)}만원`;
  if (a >= 1e4) return `${sign}${+(a / 1e4).toFixed(1)}만원`;
  return money(n);
}

/** 글자 → 가장 작은 단위 정수(쉼표·원·공백 무시, 소수는 통화 자리만큼 — 넘치면 버림). 숫자가 없으면 null */
export function parseMoney(s: string, c: Currency = "KRW") {
  const d = decimals(c);
  const [int, ...rest] = s.replace(d ? /[^\d.]/g : /[^\d]/g, "").split(".");
  const frac = rest.join("").slice(0, d);
  if (!int && !frac) return null;
  return Number((int.slice(0, 15 - d) || "0") + frac.padEnd(d, "0"));
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD"(시간대 없는 날짜) ↔ 로컬 날짜 */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** 올해: 11월 1일 (일) · 다른 해: 2025년 11월 1일 */
export function dateLabel(s: string, today = new Date()) {
  const d = fromYmd(s);
  if (d.getFullYear() !== today.getFullYear()) return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}

/** 최근 7일은 오늘·어제·n일 전, 그 밖은 dateLabel */
export function dayLabel(s: string, today = new Date()) {
  const diff = Math.round((fromYmd(ymd(today)).getTime() - fromYmd(s).getTime()) / 86_400_000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff > 1 && diff <= 7) return `${diff}일 전`;
  return dateLabel(s, today);
}

/** 오후 2:00 */
export function timeLabel(d: Date) {
  const h = d.getHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM" ± n달 */
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 2026년 11월 · 올해면 11월 */
export function monthLabel(ym: string, today = new Date()) {
  const [y, m] = ym.split("-").map(Number);
  return y === today.getFullYear() ? `${m}월` : `${y}년 ${m}월`;
}

/** 다가오는 날: 오늘·내일·모레, 그 뒤는 dayLabel */
export function soonLabel(d: string, today: string) {
  const diff = Math.round((fromYmd(d).getTime() - fromYmd(today).getTime()) / 86_400_000);
  return diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === 2 ? "모레" : dayLabel(d, fromYmd(today));
}
