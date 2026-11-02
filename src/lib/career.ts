// 커리어 화면 규칙: 경험 유형·문서 종류 이름, 링크·파일의 형식 이름(Notion·PDF·Word·PPT…). 서버·화면 공용
/** 분류 고르기 기본 목록(사용자가 쓴 분류가 먼저, 그다음 이것) */
export const DEFAULT_CATEGORIES = ["경력", "인턴", "아르바이트", "프로젝트", "교육", "대외활동", "동아리", "자격증", "어학", "수상", "봉사"];
/** 이 분류가 붙으면 자격·점수 칸을 펼쳐 둠 */
export const CERT_CATEGORIES = ["자격증", "어학"];

/** "2024.6.1", "2024-06", "2024년 6월 1일" → "2024.06.01" / "2024.06". 없는 날이면 null */
export function normDate(text: string | null | undefined) {
  const m = (text ?? "").trim().match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*(?:[.\-/월]\s*(?:(\d{1,2})\s*일?)?)?\.?$/);
  if (!m) return null;
  const [y, mo, d] = [m[1], m[2].padStart(2, "0"), m[3]?.padStart(2, "0")];
  const iso = `${y}-${mo}-${d ?? "01"}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) return null;
  return d ? `${y}.${mo}.${d}` : `${y}.${mo}`;
}
/** "2024.06" → "2024-06-01"(정렬용) */
export const dateKey = (t: string | null) => (t ? `${t.replaceAll(".", "-")}${t.length === 7 ? "-01" : ""}` : null);
/** "2024.06.01 ~ 2024.10.10" / "2025.03 ~ 진행 중" / "2024.10.13"(하루) */
export const periodLabel = (start: string | null, end: string | null, ongoing: boolean) =>
  !start && !end ? "" : ongoing ? `${start ?? ""} ~ 진행 중` : !end || end === start ? (start ?? end ?? "") : `${start ?? ""} ~ ${end}`;

export const DOC_KINDS = [
  { value: "resume", label: "이력서" },
  { value: "cover_letter", label: "자기소개서" },
  { value: "portfolio", label: "포트폴리오" },
  { value: "other", label: "기타 문서" },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]["value"];

/** 올릴 수 있는 문서 파일(확장자 → 형식 이름·MIME) */
export const FILE_TYPES: Record<string, { label: string; mime: string }> = {
  pdf: { label: "PDF", mime: "application/pdf" },
  docx: { label: "Word", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  doc: { label: "Word", mime: "application/msword" },
  pptx: { label: "PPT", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  ppt: { label: "PPT", mime: "application/vnd.ms-powerpoint" },
  hwp: { label: "한글", mime: "application/x-hwp" },
  hwpx: { label: "한글", mime: "application/hwp+zip" },
};
export const extOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** 형식 이름: 링크는 주소로(Notion·Google 문서·GitHub·Figma·웹), 파일은 확장자로 */
export function formatOf(item: { type: "link" | "file"; url: string | null; name: string | null }) {
  if (item.type === "file") return FILE_TYPES[extOf(item.name ?? "")]?.label ?? "파일";
  const host = (() => {
    try {
      return new URL(item.url ?? "").hostname;
    } catch {
      return "";
    }
  })();
  if (/(^|\.)notion\.(so|site|com)$/.test(host)) return "Notion";
  if (host === "docs.google.com" || host === "drive.google.com") return "Google";
  if (host === "github.com" || host.endsWith(".github.io")) return "GitHub";
  if (host.endsWith("figma.com")) return "Figma";
  return "웹";
}
