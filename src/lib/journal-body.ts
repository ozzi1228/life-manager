// 일기 본문: 글자(마크다운 그대로) + 사진 자리. 사진은 한 줄에 ![](photo:첨부 id) — 블로그처럼 글 사이 어디든 놓임
// 본문에 자리가 없는 사진(예전 일기)은 글 맨 아래에 이어 보임
const RE = /^!\[\]\(photo:([0-9a-f-]{36})\)$/;

export const photoLine = (id: string) => `![](photo:${id})`;
/** 이 줄이 사진 자리면 그 사진 id */
export const photoOf = (line: string) => RE.exec(line.trim())?.[1] ?? null;
/** 사진 자리를 뺀 글자(목록 미리보기) */
export const textOnly = (md: string) =>
  md
    .split("\n")
    .filter((l) => !photoOf(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
/** 본문에 놓인 사진 순서 */
export const photoIdsIn = (md: string) => md.split("\n").flatMap((l) => photoOf(l) ?? []);
