// 메모 마크다운 → 목록·검색에 보일 글자만(기호 떼기). 정확한 변환이 아니라 눈에 보기 좋게만. 확인: scripts/check-memos.mts
export const mdText = (md: string) =>
  md
    .replace(/^```.*$/gm, "")
    .replace(/^\s*(#{1,6}\s|>\s?|[-*+]\s(\[[ xX]\]\s)?|\d+\.\s|---+\s*$)/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, "$2")
    .replace(/(^|[^*\w])[*_](\S.*?)[*_](?=[^*\w]|$)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
