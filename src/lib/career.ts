// 커리어 화면 규칙: 경험 유형·문서 종류 이름, 링크·파일의 형식 이름(Notion·PDF·Word·PPT…). 서버·화면 공용
export const EXP_TYPES = [
  { value: "work", label: "업무" },
  { value: "project", label: "프로젝트" },
  { value: "intern", label: "인턴" },
  { value: "activity", label: "대외활동" },
  { value: "education", label: "교육" },
  { value: "award", label: "수상" },
  { value: "certificate", label: "자격증" },
  { value: "other", label: "기타" },
] as const;
export type ExpType = (typeof EXP_TYPES)[number]["value"];
export const expTypeLabel = (t: string) => EXP_TYPES.find((x) => x.value === t)?.label ?? "기타";

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

/** "2024-03" ~ "2025-02" → "2024.03 ~ 2025.02", 끝이 없으면 "~ 진행 중" */
export const periodLabel = (start: string | null, end: string | null) => (start ? `${start.replace("-", ".")} ~ ${end ? end.replace("-", ".") : "진행 중"}` : end ? `~ ${end.replace("-", ".")}` : "");
