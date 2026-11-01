// 로고(docs/planning/assets/logo.png)에서 앱 아이콘을 만든다. 로고를 바꾸면 다시 실행: node scripts/make-icons.mjs
// 원본은 크림색 바탕 위 둥근 사각 카드 → 카드 부분만 잘라 쓴다(모서리는 각 OS가 다시 둥글게 깎음)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "docs/planning/assets/logo.png";
const CARD = { left: 95, top: 90, width: 1060, height: 1060 }; // 1254px 원본 기준 카드 영역
const CREAM = { r: 253, g: 247, b: 241 }; // 카드 바탕색

const card = await sharp(SRC).extract(CARD).png().toBuffer();
const square = (size) => sharp(card).resize(size, size).png();

mkdirSync("public/icons", { recursive: true });
await square(192).toFile("public/icons/192.png");
await square(512).toFile("public/icons/512.png");
await square(180).toFile("src/app/apple-icon.png");
await square(192).toFile("src/app/icon.png");

// maskable: 안드로이드가 원·물방울 등으로 잘라도 그림이 남도록 가운데 80%(안전 영역)에 넣음
const inner = await square(410).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background: CREAM } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile("public/icons/maskable-512.png");

console.log("아이콘 생성 완료");
