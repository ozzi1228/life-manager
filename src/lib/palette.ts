// 목표·트래커 색 (docs/planning/03 §3.1.4): 테마와 분리, 밝은·어두운 모드에서 같은 색. 저장은 HEX(순서 번호 아님)
export const GOAL_PALETTE = [
  { name: "빨강", hex: "#E5737A" },
  { name: "주황", hex: "#F2A65A" },
  { name: "노랑", hex: "#F2CC5B" },
  { name: "연두", hex: "#A6CF6B" },
  { name: "초록", hex: "#5CB88A" },
  { name: "청록", hex: "#4DB6AC" },
  { name: "하늘", hex: "#6FB7E9" },
  { name: "파랑", hex: "#5B8DEF" },
  { name: "보라", hex: "#9A8EDB" },
  { name: "분홍", hex: "#E89AC0" },
  { name: "갈색", hex: "#B48A6A" },
  { name: "회색", hex: "#9AA4AE" },
] as const;

const DARK_TEXT = "#1A2026";

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** 칸 위 글자색: 흰 글자와 짙은 글자 중 명암비가 높은 쪽 */
export const textOn = (hex: string) => (contrast(hex, "#FFFFFF") > contrast(hex, DARK_TEXT) ? "#FFFFFF" : DARK_TEXT);
