// uuid v7(시간순) — 14 §1.1. Postgres 17에는 uuidv7()이 없어 앱에서 만듦
import { randomBytes } from "node:crypto";

export function uuidv7() {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6); // 앞 48비트 = 밀리초 시각
  b[6] = (b[6] & 0x0f) | 0x70; // 버전 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
