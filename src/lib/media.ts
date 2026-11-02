// 작품 기록 화면 규칙 (docs/planning/08 §3.1·3.3). 서버·화면 공용
export type MediaKind = "book" | "movie" | "drama";
export type MediaStatus = "ongoing" | "done" | "dropped";

export const KIND_LABEL: Record<MediaKind, string> = { book: "책", movie: "영화", drama: "드라마" };
export const KIND_UNIT: Record<MediaKind, string> = { book: "권", movie: "편", drama: "편" };

/** 종류별로 고를 수 있는 상태와 화면 이름(영화는 봤어요 하나) */
export const STATUS_OPTIONS: Record<MediaKind, { value: MediaStatus; label: string }[]> = {
  book: [
    { value: "ongoing", label: "읽는 중" },
    { value: "done", label: "완독" },
    { value: "dropped", label: "중도 포기" },
  ],
  movie: [{ value: "done", label: "봤어요" }],
  drama: [
    { value: "ongoing", label: "보는 중" },
    { value: "done", label: "다 봄" },
    { value: "dropped", label: "중도 포기" },
  ],
};
export const statusLabel = (kind: MediaKind, status: MediaStatus) => STATUS_OPTIONS[kind].find((o) => o.value === status)?.label ?? "";

/** 위시 완료 버튼 이름(09 §7) */
export const FINISH_LABEL: Record<MediaKind, string> = { book: "다 읽었어요", movie: "봤어요", drama: "다 봤어요" };
export const START_LABEL: Record<MediaKind, string | null> = { book: "읽기 시작", movie: null, drama: "보기 시작" };

/** 포스터 캘린더에 놓이는 날(08 §3.3): 끝낸 날. 드라마 보는 중은 시작일에 흐리게, 책 읽는 중은 놓지 않음(상단 띠) */
export function calendarDay(kind: MediaKind, log: { status: MediaStatus; startDate: string | null; endDate: string | null }) {
  if (log.status !== "ongoing") return log.endDate ? { date: log.endDate, faint: false } : null;
  if (kind === "drama" && log.startDate) return { date: log.startDate, faint: true };
  return null;
}

/** "책 2권 · 영화 3편" — 그 달에 끝낸 것만 */
export function monthSummary(items: { kind: MediaKind; status: MediaStatus; endDate: string | null }[], month: string) {
  const done = items.filter((i) => i.status !== "ongoing" && i.endDate?.startsWith(month));
  return (["book", "movie", "drama"] as const)
    .map((k) => [k, done.filter((i) => i.kind === k).length] as const)
    .filter(([, n]) => n)
    .map(([k, n]) => `${KIND_LABEL[k]} ${n}${KIND_UNIT[k]}`)
    .join(" · ");
}
