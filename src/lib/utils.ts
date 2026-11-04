import { createCn } from "cn/config";

// 우리 글자 크기(globals.css --text-*)를 글자 크기로 알려 줌. 안 알려 주면 text-micro + text-link 처럼 글자색과 같이 쓸 때
// 둘 중 하나를 지워 버림(크기가 사라져 본문 크기로 커짐)
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["display", "title-lg", "title", "subtitle", "body", "body-sm", "caption", "micro"] }] } },
});
