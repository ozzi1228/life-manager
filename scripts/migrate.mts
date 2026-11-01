// DB 테이블 만들기·갱신: 인증(Better Auth) + 앱 테이블(Drizzle, drizzle/ 폴더의 SQL)
// 개발 DB: node --env-file=.env scripts/migrate.mts
// 운영 DB: 업데이트 스크립트가 DATABASE_URL을 운영 DB로 바꿔 실행
// 앱 테이블을 바꿀 때: src/db/schema.ts 수정 → node --env-file=.env node_modules/drizzle-kit/bin.cjs generate --name <이름>
import { getMigrations } from "better-auth/db/migration";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { auth } from "../src/lib/auth.ts";
import { db } from "../src/db/index.ts";

const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
console.log("만들 테이블:", toBeCreated.map((t) => t.table).join(", ") || "없음");
console.log("추가할 열:", toBeAdded.map((t) => `${t.table}(${Object.keys(t.fields).join(",")})`).join(", ") || "없음");
await runMigrations();

await migrate(db, { migrationsFolder: "drizzle" });
console.log("앱 테이블: 최신");
console.log("완료");
process.exit(0);
