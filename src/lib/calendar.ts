// 일정 날짜·반복 계산 (docs/planning/07 §2.3·§9). 서버·화면·확인 스크립트 공용
// 반복은 RRULE(iCalendar) 문자열로 저장하되, 화면에서 만들 수 있는 부분만 읽고 펼침:
//   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY(매주만), UNTIL(날짜), COUNT
// 매월 31일·2월 29일처럼 그 달에 없는 날은 건너뜀(RFC 5545와 같음). 주는 일요일 시작
// ponytail: 시각은 사용자 시간대(서울) 벽시계 시각으로 저장 — 일광 절약 시간대·외부 연동이 붙으면 UTC+시간대로(07 §9)
export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Rule = { freq: Freq; interval: number; byDay: number[]; until: string | null; count: number | null };
export type EventTime = { allDay: boolean; startDate: string; startTime: string | null; endDate: string; endTime: string | null };

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const KO = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" 더하기·요일·차이 — 날짜만 다루므로 UTC로 계산 */
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86_400_000);
export const dayOfWeek = (d: string) => new Date(toUtc(d)).getUTCDay();
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1~12
const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function parseRule(s: string | null): Rule | null {
  if (!s) return null;
  const kv = Object.fromEntries(s.replace(/^RRULE:/, "").split(";").map((p) => p.split("=") as [string, string]));
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(kv.FREQ)) return null;
  const until = kv.UNTIL?.match(/^(\d{4})(\d{2})(\d{2})/);
  return {
    freq: kv.FREQ as Freq,
    interval: Math.max(1, Number(kv.INTERVAL) || 1),
    byDay: kv.BYDAY ? kv.BYDAY.split(",").map((d) => DAYS.indexOf(d)).filter((i) => i >= 0).sort() : [],
    until: until ? `${until[1]}-${until[2]}-${until[3]}` : null,
    count: kv.COUNT ? Math.max(1, Number(kv.COUNT)) : null,
  };
}

export function ruleString(r: Rule) {
  return [
    `FREQ=${r.freq}`,
    r.interval > 1 && `INTERVAL=${r.interval}`,
    r.freq === "WEEKLY" && r.byDay.length && `BYDAY=${r.byDay.map((d) => DAYS[d]).join(",")}`,
    r.until && `UNTIL=${r.until.replaceAll("-", "")}`,
    !r.until && r.count && `COUNT=${r.count}`,
  ]
    .filter(Boolean)
    .join(";");
}

/** 반복 회차의 시작 날짜들(시리즈 처음부터, to까지). COUNT는 처음부터 셈 */
export function seriesDates(start: string, r: Rule, to: string, cap = 3000) {
  const out: string[] = [];
  const end = r.until && r.until < to ? r.until : to;
  const push = (d: string) => {
    if (d < start || d > end) return d > end;
    out.push(d);
    return r.count !== null && out.length >= r.count;
  };
  const [sy, sm, sd] = [+start.slice(0, 4), +start.slice(5, 7), +start.slice(8, 10)];
  for (let i = 0; out.length < cap && i < 100_000; i++) {
    if (r.freq === "DAILY") {
      if (push(addDays(start, i * r.interval))) break;
    } else if (r.freq === "WEEKLY") {
      const week0 = addDays(start, -dayOfWeek(start) + i * 7 * r.interval);
      if (week0 > end) break;
      let stop = false;
      for (const wd of r.byDay.length ? r.byDay : [dayOfWeek(start)]) if (!stop) stop = push(addDays(week0, wd));
      if (stop) break;
    } else {
      const months = r.freq === "MONTHLY" ? i * r.interval : i * 12 * r.interval;
      const y = sy + Math.floor((sm - 1 + months) / 12);
      const m = ((sm - 1 + months) % 12) + 1;
      if (ymdOf(y, m, 1) > end) break;
      if (sd <= daysIn(y, m) && push(ymdOf(y, m, sd))) break;
    }
  }
  return out;
}

export type Exception = { originalDate: string; kind: "modified" | "cancelled"; override: Partial<EventTime & { title: string; location: string | null; memo: string | null; calendarId: string }> | null };

/** 보기 범위 [from, to]에 걸치는 회차들. 여러 날 일정은 시작~끝 길이를 회차마다 그대로 */
export function expand<E extends EventTime & { rrule: string | null }>(e: E, exceptions: Exception[], from: string, to: string) {
  const span = daysBetween(e.startDate, e.endDate);
  const rule = parseRule(e.rrule);
  const starts = rule ? seriesDates(e.startDate, rule, to) : [e.startDate];
  const out: (E & { occurrenceDate: string; modified: boolean })[] = [];
  for (const d of starts) {
    const ex = exceptions.find((x) => x.originalDate === d);
    if (ex?.kind === "cancelled") continue;
    const inst = { ...e, startDate: d, endDate: addDays(d, span), ...(ex?.override ?? {}), occurrenceDate: d, modified: !!ex };
    if (inst.startDate <= to && inst.endDate >= from) out.push(inst);
  }
  // 날짜를 옮긴 회차가 범위 밖 원래 날짜에서 범위 안으로 들어온 경우
  for (const ex of exceptions)
    if (ex.kind === "modified" && ex.override?.startDate && !starts.includes(ex.originalDate) && rule && seriesDates(e.startDate, rule, ex.originalDate).includes(ex.originalDate)) {
      const inst = { ...e, ...ex.override, occurrenceDate: ex.originalDate, modified: true };
      if (inst.startDate <= to && inst.endDate >= from) out.push(inst);
    }
  return out;
}

/** 이 회차 앞까지 몇 번 있었는지(이후 일정 나누기에서 COUNT 넘기기) */
export const countBefore = (start: string, r: Rule, date: string) => seriesDates(start, { ...r, count: null }, addDays(date, -1)).length;

/** "매주 월·수", "2주마다 화", "매월 15일", "매년 11월 2일", "까지"·"n회" 덧붙임 */
export function ruleLabel(rrule: string | null, start: string) {
  const r = parseRule(rrule);
  if (!r) return "";
  const every = (unit: string) => (r.interval > 1 ? `${r.interval}${unit}마다` : `매${unit === "일" ? "일" : unit === "주" ? "주" : unit === "개월" ? "월" : "년"}`);
  const base =
    r.freq === "DAILY"
      ? every("일")
      : r.freq === "WEEKLY"
        ? `${every("주")} ${(r.byDay.length ? r.byDay : [dayOfWeek(start)]).map((d) => KO[d]).join("·")}`
        : r.freq === "MONTHLY"
          ? `${every("개월")} ${+start.slice(8)}일`
          : `${every("년")} ${+start.slice(5, 7)}월 ${+start.slice(8)}일`;
  const untilYear = r.until && r.until.slice(0, 4) !== start.slice(0, 4) ? `${r.until.slice(0, 4)}년 ` : "";
  return base + (r.until ? ` · ${untilYear}${+r.until.slice(5, 7)}월 ${+r.until.slice(8)}일까지` : r.count ? ` · ${r.count}회` : "");
}

/** 정렬·겹침 판단용: 종일은 하루 맨 앞 */
export const sortKey = (e: EventTime) => `${e.startDate} ${e.allDay ? "00:00" : (e.startTime ?? "00:00")}`;
export const endKey = (e: EventTime) => `${e.endDate} ${e.allDay ? "24:00" : (e.endTime ?? "24:00")}`;
