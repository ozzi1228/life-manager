// 사용자 캐릭터 시트(docs/planning/assets/pets-reference.png)에서 기본 펫 동작 그림을 잘라 투명 배경 PNG로 저장
// 실행: node scripts/cut-pets.mjs [--debug]
//   → public/pets/<id>/<action>.png  (그림 한 장 = 동작 하나, 움직임은 앱이 효과로 표현)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "docs/planning/assets/pets-reference.png";

// 시트의 "기본 동작" 3×3 칸 중심 x (펫별), 행 y 범위. 시트 1536×1024 기준
const PETS = {
  pomong: [78, 173, 270],
  komong: [397, 492, 588],
  piyo: [701, 791, 881],
  meongi: [995, 1088, 1182],
  hoya: [1295, 1384, 1473],
};
const ROWS = [
  [400, 486],
  [515, 600],
  [628, 712],
];
const ACTIONS = [
  ["idle", "walk", "sit"],
  ["surprised", "happy", "sleep"],
  ["hover", "follow", "discover"],
];
const HALF_W = 46;

const debug = process.argv.includes("--debug");
const img = sharp(SRC);
const OUT = 96; // 저장 크기(정사각, 발이 아래쪽에 오도록 맞춤)
const T_CUT = 26; // 이보다 배경색에 가까우면 배경(가장자리에서 이어진 것만)
const T_SOFT = 46; // 배경과 맞닿은 이 범위는 반투명(가장자리 부드럽게)

const dist = (d, i, c) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);

// 칸 하나 → 투명 배경, 내용에 맞춰 자른 뒤 OUT×OUT 캔버스 아래쪽 가운데에 배치
async function cutCell(left, top, width, height) {
  const { data, info } = await img.clone().extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const px = (x, y) => (y * W + x) * 4;

  // 배경색: 테두리 픽셀의 중앙값
  const border = [];
  for (let x = 0; x < W; x++) border.push(px(x, 0), px(x, H - 1));
  for (let y = 0; y < H; y++) border.push(px(0, y), px(W - 1, y));
  const bg = [0, 1, 2].map((k) => border.map((i) => data[i + k]).sort((a, b) => a - b)[border.length >> 1]);

  // 가장자리에서 시작하는 채우기
  const bgMask = new Uint8Array(W * H);
  const stack = [];
  for (const i of border) {
    const p = i / 4;
    if (!bgMask[p] && dist(data, i, bg) < T_CUT) {
      bgMask[p] = 1;
      stack.push(p);
    }
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % W;
    const y = (p - x) / W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (!bgMask[q] && dist(data, q * 4, bg) < T_CUT) {
        bgMask[q] = 1;
        stack.push(q);
      }
    }
  }
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (bgMask[p]) data[i + 3] = 0;
    else {
      // 배경과 맞닿은 옅은 가장자리는 반투명
      const x = p % W;
      const y = (p - x) / W;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => bgMask[(y + dy) * W + (x + dx)]);
      const d = dist(data, i, bg);
      if (touches && d < T_SOFT) data[i + 3] = Math.round((255 * (d - T_CUT)) / (T_SOFT - T_CUT));
    }
  }

  const trimmed = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const { width: tw, height: th } = trimmed.info;
  const k = Math.min(1, (OUT - 4) / Math.max(tw, th));
  const sw = Math.round(tw * k);
  const sh = Math.round(th * k);
  const body = k < 1 ? await sharp(trimmed.data).resize(sw, sh).png().toBuffer() : trimmed.data;
  return sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left: Math.round((OUT - sw) / 2), top: OUT - 2 - sh }])
    .png()
    .toBuffer();
}

const results = [];
for (const [id, xs] of Object.entries(PETS)) {
  mkdirSync(`public/pets/${id}`, { recursive: true });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const [t, b] = ROWS[r];
      const png = await cutCell(xs[c] - HALF_W, t, HALF_W * 2, b - t);
      await sharp(png).toFile(`public/pets/${id}/${ACTIONS[r][c]}.png`);
      results.push(png);
    }
  }
  console.log(`public/pets/${id}/*.png`);
}

if (debug) {
  // 자른 결과를 자홍색 배경에 모아 보기(지워지면 안 되는 곳이 지워졌는지 확인)
  await sharp({ create: { width: (OUT + 4) * 9, height: (OUT + 4) * 5, channels: 3, background: "#ff00ff" } })
    .composite(results.map((input, i) => ({ input, left: (i % 9) * (OUT + 4), top: Math.floor(i / 9) * (OUT + 4) })))
    .png()
    .toFile("scripts/.cut-result.png");
  console.log("scripts/.cut-result.png");
}

if (debug) {
  // 잘라낼 칸을 한 장에 모아 보기
  const tiles = [];
  for (const xs of Object.values(PETS)) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const [t, b] = ROWS[r];
        tiles.push(
          await img.clone().extract({ left: xs[c] - HALF_W, top: t, width: HALF_W * 2, height: b - t }).png().toBuffer(),
        );
      }
    }
  }
  const W = HALF_W * 2 + 4;
  const H = 90;
  await sharp({ create: { width: W * 9, height: H * 5, channels: 3, background: "#ff00ff" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 9) * W, top: Math.floor(i / 9) * H })))
    .png()
    .toFile("scripts/.cut-debug.png");
  console.log("scripts/.cut-debug.png");
}
