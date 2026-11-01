"use client";

// 0단계 V-02: 테마 명암비 실측 (docs/planning/03-design-system.md §2.2 T-2·T-3)
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const PAIRS: [fg: string, bg: string, use: string, min: number][] = [
  ["foreground", "background", "본문", 4.5],
  ["muted-foreground", "background", "보조 글자", 4.5],
  ["card-foreground", "card", "카드 글자", 4.5],
  ["primary-foreground", "primary", "기본 버튼 글자", 4.5],
  ["primary", "background", "T-2 기본색을 글자로", 4.5],
  ["accent-foreground", "background", "T-2 대안 --link", 4.5],
  ["secondary-foreground", "secondary", "보조 버튼", 4.5],
  ["destructive-foreground", "destructive", "T-3 삭제 버튼 글자", 4.5],
  ["destructive", "background", "T-3 빨간 글자", 4.5],
  ["border", "background", "구분선(참고)", 1],
  ["ring", "background", "포커스 링", 3],
];

// 브라우저가 oklch를 그린 픽셀을 읽어 sRGB로 바꾼다
function rgbOf(cssVar: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(`--${cssVar}`).trim();
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export default function ThemeCheck() {
  const [dark, setDark] = useState(false);
  const [ratios, setRatios] = useState<number[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    // getComputedStyle가 바뀐 클래스를 바로 반영하므로 마이크로태스크로 충분(화면이 가려져도 동작)
    queueMicrotask(() => setRatios(PAIRS.map(([fg, bg]) => contrast(rgbOf(fg), rgbOf(bg)))));
  }, [dark]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">테마 점검</h1>
        <Button variant="outline" onClick={() => setDark((d) => !d)}>
          {dark ? "밝게 보기" : "어둡게 보기"}
        </Button>
      </div>

      <section className="space-y-2">
        <p className="text-lg font-semibold">가나다라마바사 ABC 0123456789 · 12,000원</p>
        <p className="font-mono text-sm">pet.json · 2026-11-01 · 13,500</p>
        <p className="text-muted-foreground text-sm">
          글꼴: Pretendard(밝은·어두운 모드 동일해야 함)
        </p>
        <div className="flex flex-wrap gap-2">
          <Button>지출 추가</Button>
          <Button variant="secondary">보조</Button>
          <Button variant="outline">취소</Button>
          <Button variant="ghost">더 보기</Button>
          <Button variant="destructive">영구 삭제</Button>
          <Button variant="link">자세히 보기</Button>
        </div>
      </section>

      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-left">
          <tr>
            <th className="py-2">조합</th>
            <th>쓰임</th>
            <th>미리보기</th>
            <th className="text-right">명암비</th>
            <th className="text-right">기준</th>
          </tr>
        </thead>
        <tbody>
          {PAIRS.map(([fg, bg, use, min], i) => {
            const r = ratios[i];
            const ok = r !== undefined && r >= min;
            return (
              <tr key={fg + bg} className="border-t">
                <td className="py-2 font-mono text-xs">
                  {fg} / {bg}
                </td>
                <td>{use}</td>
                <td>
                  <span
                    className="rounded px-2 py-1"
                    style={{ color: `var(--${fg})`, background: `var(--${bg})` }}
                  >
                    가나다 Aa
                  </span>
                </td>
                <td className="text-right tabular-nums">{r ? r.toFixed(2) : "…"}</td>
                <td className={`text-right ${ok ? "" : "text-destructive font-semibold"}`}>
                  {min}:1 {ok ? "통과" : "미달"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
