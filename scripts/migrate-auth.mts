// 인증 테이블 만들기·갱신 (Better Auth 마이그레이션)
// 개발 DB: node --env-file=.env scripts/migrate-auth.mts
// 운영 DB: docker compose exec app 대신 DATABASE_URL을 운영 DB로 바꿔 실행(업데이트 스크립트에서 호출)
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/lib/auth.ts";

const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
console.log("만들 테이블:", toBeCreated.map((t) => t.table).join(", ") || "없음");
console.log("추가할 열:", toBeAdded.map((t) => `${t.table}(${Object.keys(t.fields).join(",")})`).join(", ") || "없음");
await runMigrations();
console.log("완료");
process.exit(0);
