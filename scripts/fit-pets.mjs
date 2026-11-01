// 고해상도 펫 그림(docs/planning/assets/pets-hd/<id>/<동작>.png, 투명 배경)을 앱용으로 맞춘다 → public/pets/<id>/<동작>.png
// 실행: node scripts/fit-pets.mjs   (그림을 새로 받으면 다시 실행)
// - 내용만 잘라 OUT×OUT 캔버스 아래 가운데에 놓음(발이 같은 줄에 오게)
// - 서 있는 동작은 키를 똑같이 맞춤(동작이 바뀔 때 펫이 커졌다 작아지지 않게), 앉기·잠자기는 그 펫의 서 있는 배율을 그대로 씀
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const PETS = ["pomong", "komong", "piyo", "meongi", "hoya"];
const STANDING = ["idle", "walk", "surprised", "happy", "hover", "discover"];
const OTHERS = ["sit", "sleep"];
const OUT = 256; // 표시 80px × 화면 배율 3까지 선명
const HEIGHT = 0.9; // 서 있는 동작의 키(캔버스 대비)
const BOTTOM = Math.round(OUT * 0.03); // 발 아래 여백(렌더러의 발 영역 FEET_LINE 86%와 맞춤)

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const id of PETS) {
  const trimmed = {};
  for (const pose of [...STANDING, ...OTHERS]) {
    const { data, info } = await sharp(`docs/planning/assets/pets-hd/${id}/${pose}.png`).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
    trimmed[pose] = { data, w: info.width, h: info.height };
  }
  const scale = {};
  for (const p of STANDING) scale[p] = (OUT * HEIGHT) / trimmed[p].h;
  const common = median(STANDING.map((p) => scale[p]));
  for (const p of OTHERS) scale[p] = common;
  // 넓은 그림(누운 잠자기 등)이 캔버스를 넘으면 그 펫 전체를 같은 비율로 줄임
  const fit = Math.min(1, ...Object.keys(scale).map((p) => (OUT * 0.98) / (trimmed[p].w * scale[p])));

  mkdirSync(`public/pets/${id}`, { recursive: true });
  for (const [pose, t] of Object.entries(trimmed)) {
    const w = Math.round(t.w * scale[pose] * fit);
    const h = Math.round(t.h * scale[pose] * fit);
    const img = await sharp(t.data).resize(w, h).toBuffer();
    await sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: img, left: Math.round((OUT - w) / 2), top: OUT - BOTTOM - h }])
      .png({ compressionLevel: 9 })
      .toFile(`public/pets/${id}/${pose}.png`);
  }
  console.log(id, "배율", (common * fit).toFixed(3), fit < 1 ? `(넓은 그림 때문에 ${fit.toFixed(2)}배 축소)` : "");
}
