// AI 키 암호화(src/lib/ai/secret.ts) 확인: node --env-file=.env scripts/check-ai.mts
import assert from "node:assert/strict";
import { seal, unseal } from "../src/lib/ai/secret.ts";

const s = seal("sk-test-1234");
assert.equal(unseal(s), "sk-test-1234");
assert.notEqual(seal("sk-test-1234"), s, "매번 다른 IV");
const [v, iv, tag, body] = s.split(".");
const flipped = Buffer.from(body, "base64");
flipped[0] ^= 1;
assert.throws(() => unseal([v, iv, tag, flipped.toString("base64")].join(".")), "변조 감지");
console.log("AI 키 암호화 확인 통과");
