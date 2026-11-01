// AI API 키 암호화 저장 (docs/planning/12 §4): AES-256-GCM, 마스터 키는 .env의 AI_KEY_SECRET(32바이트 base64)
// ponytail: 마스터 키로 바로 암호화(봉투 암호화 아님). 마스터 키를 바꿔야 할 일이 생기면 데이터 키 계층을 추가
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function masterKey() {
  const k = Buffer.from(process.env.AI_KEY_SECRET ?? "", "base64");
  if (k.length !== 32) throw new Error("AI_KEY_SECRET(32바이트 base64)이 .env에 필요해요");
  return k;
}

export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function unseal(sealed: string) {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1") throw new Error("알 수 없는 암호화 형식");
  const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
}
