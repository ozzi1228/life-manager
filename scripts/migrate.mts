// DB 테이블 만들기·갱신: 인증(Better Auth) + 앱 테이블
// 개발 DB: node --env-file=.env scripts/migrate.mts
// 운영 DB: 업데이트 스크립트가 DATABASE_URL을 운영 DB로 바꿔 실행
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/lib/auth.ts";
import { pool } from "../src/lib/db.ts";

const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
console.log("만들 테이블:", toBeCreated.map((t) => t.table).join(", ") || "없음");
console.log("추가할 열:", toBeAdded.map((t) => `${t.table}(${Object.keys(t.fields).join(",")})`).join(", ") || "없음");
await runMigrations();

// ponytail: 앱 테이블은 여기서 SQL로. 테이블이 늘어나는 M-04(데이터 기반)에서 Drizzle 마이그레이션으로 옮김
await pool.query(`
  -- AI 연결(docs/planning/12 §3·§4): 사용자별 사용 순서. 구독(*_plan)은 이 PC의 로그인 폴더를 쓰고 소유자만 가능
  create table if not exists ai_connection (
    id uuid primary key default gen_random_uuid(),
    user_id text not null references "user"(id) on delete cascade,
    kind text not null check (kind in ('claude_plan', 'chatgpt_plan', 'anthropic_key', 'openai_key', 'gemini_key')),
    priority int not null,
    secret text,       -- API 키(AES-256-GCM, src/lib/ai/secret.ts). 구독은 null
    secret_last4 text, -- 화면 표시용 끝 4자리
    model text,        -- 비우면 기본 모델
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, kind)
  );
`);
console.log("앱 테이블: ai_connection 확인");
console.log("완료");
process.exit(0);
