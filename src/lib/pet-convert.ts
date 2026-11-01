// 사용자 지정 펫 업로드 변환 (0단계 V-06, docs/planning/11-pet-system.md §5)
// 한 장(PNG·WebP) 또는 움직이는 그림(GIF·움직이는 WebP) → 가로로 프레임을 늘어놓은 스프라이트 시트(WebP)
// - 모든 프레임을 같은 상자로 잘라 같은 배율로 줄임 → 동작 안에서 발 위치가 흔들리지 않음
// - 캔버스 PET_OUT×PET_OUT 아래 가운데, 발 아래 여백은 기본 펫과 같게(scripts/fit-pets.mjs)
import sharp, { type Metadata } from "sharp";

export const PET_OUT = 256;
const BOTTOM = Math.round(PET_OUT * 0.03);
const MAX_BYTES = 2 * 1024 * 1024; // 11 §5.3: 파일당 2MB
const MAX_FRAMES = 24; // 11 §5.3: 동작당 4~24프레임
const MAX_SIDE = 2048;
const SEEN = 16; // 이 값보다 불투명한 픽셀만 그림으로 봄

export class PetUploadError extends Error {} // 메시지를 그대로 화면에 보여 줌

export type PetSheet = { sheet: Buffer; frames: number; fps: number; loop: boolean; warnings: string[] };

// APNG는 PNG 안에 acTL 덩어리가 그림 데이터(IDAT)보다 먼저 옴. sharp(libvips)는 APNG의 첫 장만 읽는다
const isApng = (b: Buffer) => {
  const ac = b.indexOf("acTL");
  return ac > 0 && ac < b.indexOf("IDAT");
};

export async function convertPetImage(input: Buffer): Promise<PetSheet> {
  if (input.length > MAX_BYTES) throw new PetUploadError("파일이 2MB보다 커요. 크기를 256px로 줄여서 다시 올려 주세요.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { animated: true }).metadata();
  } catch {
    throw new PetUploadError("그림 파일을 읽을 수 없어요. PNG·WebP·GIF로 올려 주세요.");
  }
  if (!["png", "webp", "gif"].includes(meta.format)) throw new PetUploadError("PNG·WebP·GIF만 올릴 수 있어요.");

  const W = meta.width;
  const H = meta.pageHeight ?? meta.height;
  const pages = meta.pages ?? 1;
  if (W > MAX_SIDE || H > MAX_SIDE) throw new PetUploadError(`그림이 너무 커요. 가로세로 ${MAX_SIDE}px 이하로 올려 주세요.`);
  if (pages > MAX_FRAMES) throw new PetUploadError(`움직이는 그림은 ${MAX_FRAMES}장까지 올릴 수 있어요. 지금 ${pages}장이에요.`);

  const warnings: string[] = [];
  if (meta.format === "png" && isApng(input)) warnings.push("APNG는 첫 장만 쓰여요. 움직이는 그림은 GIF나 움직이는 WebP로 올려 주세요.");

  // 모든 프레임을 세로로 이어 붙인 RGBA
  const { data } = await sharp(input, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * W + x) * 4 + 3];

  // 모든 프레임을 합친 그림 영역(한 상자로 잘라야 프레임마다 위치가 같음)
  let l = W, t = H, r = -1, b = -1;
  for (let p = 0; p < pages; p++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (alpha(x, p * H + y) > SEEN) {
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
  if (r < 0) throw new PetUploadError("그림이 비어 있어요. 캐릭터가 보이는 그림을 올려 주세요.");

  const corners = [alpha(0, 0), alpha(W - 1, 0), alpha(0, H - 1), alpha(W - 1, H - 1)];
  if (corners.every((a) => a > 250)) warnings.push("배경이 투명하지 않은 것 같아요. 네모난 배경이 보이면 배경을 투명하게 저장해 주세요.");

  const bw = r - l + 1;
  const bh = b - t + 1;
  const scale = Math.min((PET_OUT * 0.9) / bh, (PET_OUT * 0.98) / bw);
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));

  const raw = { raw: { width: W, height: H * pages, channels: 4 as const } };
  const frames = await Promise.all(
    Array.from({ length: pages }, (_, p) =>
      sharp(data, raw).extract({ left: l, top: p * H + t, width: bw, height: bh }).resize(w, h).png().toBuffer(),
    ),
  );
  const sheet = await sharp({ create: { width: PET_OUT * pages, height: PET_OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((input, p) => ({ input, left: p * PET_OUT + Math.round((PET_OUT - w) / 2), top: PET_OUT - BOTTOM - h })))
    .webp({ quality: 90, alphaQuality: 100, effort: 6 }) // 무손실 대비 약 1/3 크기, 가장자리 차이 없음(V-06 측정)
    .toBuffer();

  // 프레임 간격의 중앙값으로 재생 속도(GIF는 간격 0~10ms를 100ms로 보는 브라우저 관례를 따름)
  const delays = (meta.delay ?? []).map((d) => (d <= 10 ? 100 : d)).sort((a, c) => a - c);
  const fps = pages > 1 ? Math.min(30, Math.max(1, Math.round(1000 / (delays[Math.floor(delays.length / 2)] ?? 100)))) : 0;

  return { sheet, frames: pages, fps, loop: pages > 1 && (meta.loop ?? 0) === 0, warnings };
}
