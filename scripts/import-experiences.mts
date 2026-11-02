// 경험 정리 가져오기: 경험 양식(expInput) 모양의 JSON 배열을 한 계정에 넣음. 같은 경험명+시작일이 있으면 건너뜀
// 실행: node --env-file=.env scripts/import-experiences.mts <아이디> <JSON 파일> [출처(기본 notion)]
//   운영 DB에 넣을 때는 DATABASE_URL을 운영 주소로 바꿔서(scripts/update.ps1의 마이그레이션 단계처럼)
//   JSON은 개인 정보(자격 번호 등)라 저장소 밖에 둘 것
import { readFileSync } from "node:fs";
import { pool } from "../src/lib/db.ts";
import { createExp, expList } from "../src/server/career.ts";

const [username, file, source = "notion"] = process.argv.slice(2);
if (!username || !file) throw new Error("사용법: import-experiences.mts <아이디> <JSON 파일> [출처]");

try {
  const { rows } = await pool.query<{ id: string }>(`select id from "user" where username = $1`, [username.toLowerCase()]);
  if (!rows[0]) throw new Error(`계정 없음: ${username}`);
  const ctx = { userId: rows[0].id, actor: "user" as const };
  const items = JSON.parse(readFileSync(file, "utf8")) as { title: string; startText?: string | null }[];
  const seen = new Set((await expList(ctx)).map((e) => `${e.title}|${e.startText ?? ""}`));
  let added = 0;
  for (const it of items) {
    const key = `${it.title.trim()}|${it.startText ?? ""}`;
    if (seen.has(key)) {
      console.log(`이미 있음: ${it.title}`);
      continue;
    }
    await createExp(ctx, it, source);
    seen.add(key);
    added++;
  }
  console.log(`추가함: ${added}개 / 전체 ${items.length}개`);
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}
