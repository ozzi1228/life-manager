// 화면 표시 형식 (docs/planning/03 §9.4). 금액은 원 단위 정수
// 주의: today를 생략하면 지금 시각을 읽음 → 클라이언트 컴포넌트의 렌더 중에는 today를 넘겨야 함(미리 그리는 화면에 날짜가 굳지 않게)
const won = new Intl.NumberFormat("ko-KR");

/** 12,000원 · 수입·환불은 +50,000원(색이 아니라 부호로) */
export function money(n: number, o: { sign?: boolean } = {}) {
  const s = `${won.format(Math.abs(n))}원`;
  return n < 0 ? `-${s}` : o.sign && n > 0 ? `+${s}` : s;
}

/** 위젯용 요약: 9,800원 · 1.2만원 · 230만원 · 1.5억원 */
export function moneyShort(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e8) return `${sign}${+(a / 1e8).toFixed(1)}억원`;
  if (a >= 1e6) return `${sign}${Math.round(a / 1e4)}만원`;
  if (a >= 1e4) return `${sign}${+(a / 1e4).toFixed(1)}만원`;
  return money(n);
}

/** 글자 → 원 단위 정수(쉼표·원·공백 무시). 숫자가 없으면 null */
export function parseMoney(s: string) {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits.slice(0, 15)) : null;
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
