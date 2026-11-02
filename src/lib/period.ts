// 기간(연·월·주·일) key와 이름. key는 일정 기간 메모와 같음(src/server/calendar.ts periodKey): 연 "2026" · 월 "2026-11" · 주는 그 주 일요일 · 일
import { addDays, dayOfWeek } from "./calendar.ts";

export type PeriodScope = "year" | "month" | "week" | "day";
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 올바른 key인지(주는 일요일이어야 함) */
export function validPeriodKey(scope: PeriodScope, key: string) {
  if (scope === "year") return /^\d{4}$/.test(key);
  if (scope === "month") return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || addDays(key, 0) !== key) return false; // 없는 날(2월 30일 등) 거름
  return scope === "day" || dayOfWeek(key) === 0;
}

/** 화면 이름. 올해가 아니면 연도를 앞에 붙임. 예: "2026년 11월", "11월 1일 ~ 7일", "11월 2일 (월)" */
export function periodLabel(scope: PeriodScope, key: string, thisYear: number) {
  const y = +key.slice(0, 4);
  const pre = y === thisYear ? "" : `${y}년 `;
  const md = (d: string) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
  if (scope === "year") return `${y}년`;
  if (scope === "month") return `${y}년 ${+key.slice(5, 7)}월`;
  if (scope === "day") return `${pre}${md(key)} (${WEEKDAY[dayOfWeek(key)]})`;
  const end = addDays(key, 6);
  return `${pre}${md(key)} ~ ${end.slice(5, 7) === key.slice(5, 7) ? `${+end.slice(8, 10)}일` : md(end)}`;
}
