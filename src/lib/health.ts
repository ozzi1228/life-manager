// 건강 기록 계산 (docs/planning/10 §4·5). 기록 도구일 뿐 — 정상·위험 같은 판정은 하지 않음(10 §2)
// 생리 주기는 만들지 않음(D-063). 주사 기록: 약 이름·용량·부위(부위를 돌려 가며 맞도록 최근 부위를 보여 줌)
export type HealthKind = "weight" | "glucose" | "injection";
export type Injection = { name: string; dose: string | null; site: string | null };
export const SITES = ["배 왼쪽", "배 오른쪽", "허벅지 왼쪽", "허벅지 오른쪽", "팔 왼쪽", "팔 오른쪽", "엉덩이"];
export type GlucoseContext = "fasting" | "before_meal" | "after_1h" | "after_2h" | "bedtime" | "other";
export type HealthPoint = { date: string; time: string; value: number; context: GlucoseContext | null };

export const CONTEXTS: { value: GlucoseContext; label: string }[] = [
  { value: "fasting", label: "공복" },
  { value: "before_meal", label: "식전" },
  { value: "after_1h", label: "식후 1시간" },
  { value: "after_2h", label: "식후 2시간" },
  { value: "bedtime", label: "취침 전" },
  { value: "other", label: "기타" },
];
export const contextLabel = (c: GlucoseContext | null) => CONTEXTS.find((x) => x.value === c)?.label ?? "";

const byTime = (a: HealthPoint, b: HealthPoint) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);

/** 날짜별 대표값 = 그날 마지막 값(10 §4), 날짜 순 */
export function dailyLast(points: HealthPoint[]) {
  const m = new Map<string, number>();
  for (const p of [...points].sort(byTime)) m.set(p.date, p.value);
  return [...m].map(([date, value]) => ({ date, value }));
}

/** 최근 값과 그보다 7일 이상 앞선 마지막 값의 차이(소수 1자리). 비교할 값이 없으면 null */
export function weekChange(daily: { date: string; value: number }[]) {
  const last = daily.at(-1);
  if (!last) return null;
  const weekAgo = new Date(Date.parse(`${last.date}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const before = daily.filter((d) => d.date <= weekAgo).at(-1);
  return before ? Math.round((last.value - before.value) * 10) / 10 : null;
}

/** 오늘 혈당: 측정 시점별 마지막 값, 시간 순 */
export function glucoseOn<T extends HealthPoint>(points: T[], date: string) {
  const m = new Map<GlucoseContext | null, T>();
  for (const p of points.filter((x) => x.date === date).sort(byTime)) m.set(p.context, p);
  return [...m.values()].sort(byTime);
}
