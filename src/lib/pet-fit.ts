// 펫 그림(투명 배경, 동작별 한 장)을 앱용 256×256으로 맞춤. 기본 펫(scripts/fit-pets.mjs)과 내 펫(src/server/pets.ts)이 같이 씀
// - 내용만 잘라 캔버스 아래 가운데에 놓음(발이 같은 줄에 오게)
// - 서 있는 동작은 키를 똑같이 맞춤(동작이 바뀔 때 펫이 커졌다 작아지지 않게), 앉기·잠자기는 서 있는 배율을 그대로 씀
import sharp from "sharp";

export const PET_POSES = ["idle", "sit", "surprised", "happy", "sleep", "hover", "discover", "walk"] as const;
export type PetPose = (typeof PET_POSES)[number];
const LOW = new Set<string>(["sit", "sleep"]);
const OUT = 256; // 표시 80px × 화면 배율 3까지 선명
const HEIGHT = 0.9; // 서 있는 동작의 키(캔버스 대비)
const BOTTOM = Math.round(OUT * 0.03); // 발 아래 여백(렌더러의 발 영역 FEET_LINE 86%와 맞춤)

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** 동작별 원본 → 동작별 256px PNG. idle 필수 */
export async function fitPet(files: Partial<Record<PetPose, Buffer>>) {
  if (!files.idle) throw new Error("idle 그림이 필요해요");
  const trimmed: Partial<Record<PetPose, { data: Buffer; w: number; h: number }>> = {};
  for (const [pose, buf] of Object.entries(files) as [PetPose, Buffer][]) {
    const { data, info } = await sharp(buf).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
    trimmed[pose] = { data, w: info.width, h: info.height };
  }
  const poses = Object.keys(trimmed) as PetPose[];
  const scale: Partial<Record<PetPose, number>> = {};
  for (const p of poses) if (!LOW.has(p)) scale[p] = (OUT * HEIGHT) / trimmed[p]!.h;
  const common = median(poses.filter((p) => !LOW.has(p)).map((p) => scale[p]!));
  for (const p of poses) if (LOW.has(p)) scale[p] = common;
  // 넓은 그림(누운 잠자기 등)이 캔버스를 넘으면 펫 전체를 같은 비율로 줄임
  const fit = Math.min(1, ...poses.map((p) => (OUT * 0.98) / (trimmed[p]!.w * scale[p]!)));

  const out: Partial<Record<PetPose, Buffer>> = {};
  for (const p of poses) {
    const t = trimmed[p]!;
    const w = Math.round(t.w * scale[p]! * fit);
    const h = Math.round(t.h * scale[p]! * fit);
    const img = await sharp(t.data).resize(w, h).toBuffer();
    out[p] = await sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: img, left: Math.round((OUT - w) / 2), top: OUT - BOTTOM - h }])
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
  return { images: out, scale: common * fit, shrunk: fit < 1 ? fit : null };
}
