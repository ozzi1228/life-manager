// 고해상도 펫 그림(docs/planning/assets/pets-hd/<id>/<동작>.png, 투명 배경)을 앱용으로 맞춘다 → public/pets/<id>/<동작>.png
// 실행: node scripts/fit-pets.mjs   (그림을 새로 받으면 다시 실행). 맞추는 규칙은 src/lib/pet-fit.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PET_POSES, fitPet } from "../src/lib/pet-fit.ts";

const PETS = ["pomong", "komong", "piyo", "meongi", "hoya"];

for (const id of PETS) {
  const files = Object.fromEntries(PET_POSES.map((p) => [p, readFileSync(`docs/planning/assets/pets-hd/${id}/${p}.png`)]));
  const { images, scale, shrunk } = await fitPet(files);
  mkdirSync(`public/pets/${id}`, { recursive: true });
  for (const [pose, buf] of Object.entries(images)) writeFileSync(`public/pets/${id}/${pose}.png`, buf);
  console.log(id, "배율", scale.toFixed(3), shrunk ? `(넓은 그림 때문에 ${shrunk.toFixed(2)}배 축소)` : "");
}
