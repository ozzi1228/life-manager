// 앱 전체가 함께 쓰는 Postgres 연결(인증·AI 연결 등)
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
