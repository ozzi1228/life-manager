// 기간 메모 서식(굵게·기울임·밑줄·취소선). 저장은 아주 작은 HTML — 허용한 태그만 남기고 속성은 모두 지움. 서버(저장 전)·화면 공용
// 예전 메모는 일반 글자(줄바꿈) → 화면에 넣을 때 이스케이프해 그대로 보임
const TAGS: Record<string, string> = { b: "b", strong: "b", i: "i", em: "i", u: "u", s: "s", strike: "s", del: "s", br: "br", div: "div", p: "div" };

/** 허용 태그만(같은 뜻은 b·i·u·s·div로 맞춤), 속성 없이. 지운 뒤 새 태그가 생기지 않을 때까지 되풀이(<scr<x>ipt> 같은 것) */
export function cleanNote(html: string) {
  let s = html;
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi, (_, slash: string, tag: string) => {
      const t = TAGS[tag.toLowerCase()];
      return !t ? "" : t === "br" ? (slash ? "" : "<br>") : `<${slash}${t}>`;
    });
  }
  return s;
}

const RICH = /<(b|i|u|s|br|div)>/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 편집 칸에 넣을 HTML */
export const noteHtml = (body: string) => (RICH.test(body) ? cleanNote(body) : esc(body).replace(/\n/g, "<br>"));

/** 한 줄 요약 등에 쓸 글자만 */
export const noteText = (body: string) =>
  RICH.test(body)
    ? body
        .replace(/<br>|<\/div>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
    : body;
