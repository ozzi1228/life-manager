// 펫 업로드 변환(src/lib/pet-convert.ts) 확인: node scripts/check-pet-convert.mts [저장 폴더]
// 기본 펫 그림으로 움직이는 GIF·WebP, 흰 배경 PNG 등을 만들어 변환해 보고 결과를 검사한다
// 저장 폴더를 주면 시험 입력과 변환 결과를 저장(눈으로 확인용)
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { convertPetImage, PET_OUT, PetUploadError } from "../src/lib/pet-convert.ts";

const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const S = 512;
const POSES = ["idle", "happy", "hover", "surprised"];

// 멍이 4장을 세로로 이어 붙인 RGBA(프레임마다 위치를 조금씩 옮겨 "모든 프레임을 한 상자로 자르기"를 시험)
const frames = await Promise.all(POSES.map((p) => sharp(`public/pets/meongi/${p}.png`).resize(S - 60, S - 60).toBuffer()));
const tall = await sharp({ create: { width: S, height: S * frames.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frames.map((input, i) => ({ input, left: i * 12, top: i * S + 20 + i * 8 })))
  .raw()
  .toBuffer();
const animated = () => sharp(tall, { raw: { width: S, height: S * frames.length, channels: 4, pageHeight: S } });

const inputs: Record<string, Buffer> = {
  gif: await animated().gif({ delay: [125, 125, 125, 125], loop: 0 }).toBuffer(),
  webp: await animated().webp({ delay: [125, 125, 125, 125], loop: 0, quality: 90, alphaQuality: 100 }).toBuffer(),
  png: await sharp("public/pets/meongi/idle.png").png().toBuffer(),
  whitePng: await sharp("public/pets/meongi/idle.png").flatten({ background: "#ffffff" }).png().toBuffer(),
};

// 프레임별 발 위치(가장 아래 불투명 줄)
async function feetRows(sheet: Buffer, n: number) {
  const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, PET_OUT * n);
  assert.equal(info.height, PET_OUT);
  return Array.from({ length: n }, (_, f) => {
    for (let y = PET_OUT - 1; y >= 0; y--)
      for (let x = f * PET_OUT; x < (f + 1) * PET_OUT; x++) if (data[(y * info.width + x) * 4 + 3] > 16) return y;
    return -1;
  });
}

for (const [name, buf] of Object.entries(inputs)) {
  const r = await convertPetImage(buf);
  const rows = await feetRows(r.sheet, r.frames);
  console.log(`${name}: 입력 ${(buf.length / 1024).toFixed(0)}KB → ${r.frames}프레임 ${r.fps}fps 반복 ${r.loop} 결과 ${(r.sheet.length / 1024).toFixed(0)}KB, 발 줄 ${rows.join(",")}`, r.warnings);
  if (out) {
    writeFileSync(`${out}/in-${name}.${name === "gif" ? "gif" : name === "webp" ? "webp" : "png"}`, buf);
    writeFileSync(`${out}/out-${name}.webp`, r.sheet);
  }
  if (name === "gif" || name === "webp") {
    assert.equal(r.frames, 4);
    assert.equal(r.fps, 8);
    assert.equal(r.loop, true);
    // 프레임마다 위치가 달라도 한 상자로 잘랐으므로 상대 위치가 유지됨 → 가장 낮은 프레임의 발이 바닥 줄, 나머지는 그 위
    assert.equal(Math.max(...rows), PET_OUT - Math.round(PET_OUT * 0.03) - 1);
  } else {
    assert.equal(r.frames, 1);
    assert.equal(r.fps, 0);
  }
  assert.equal(r.warnings.length > 0, name === "whitePng", `${name} 경고`);
}

// 거부해야 하는 입력
const rejects: Record<string, Buffer> = {
  empty: await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer(),
  tooBig: Buffer.alloc(2 * 1024 * 1024 + 1),
  notImage: Buffer.from("hello"),
  jpeg: await sharp("public/pets/meongi/idle.png").jpeg().toBuffer(),
};
for (const [name, buf] of Object.entries(rejects)) {
  await assert.rejects(convertPetImage(buf), PetUploadError, name);
  console.log(`${name}: 거부됨`);
}
console.log("펫 업로드 변환 확인 통과");
