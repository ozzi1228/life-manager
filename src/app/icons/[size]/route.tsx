import { ImageResponse } from "next/og";

// ponytail: 임시 아이콘(글자 "o"). 로고·아이콘 디자인은 Q-180에서 펫 시트 확정 후 교체
const SIZES = [180, 192, 512];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = SIZES.includes(Number(raw)) ? Number(raw) : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1b96e6",
          color: "#14181c",
          fontSize: size * 0.62,
          fontWeight: 700,
          paddingBottom: size * 0.08,
        }}
      >
        o
      </div>
    ),
    { width: size, height: size },
  );
}
