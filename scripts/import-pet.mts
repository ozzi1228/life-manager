// 내 펫 넣기(업로드 화면 C-03 전까지): 폴더의 <동작>.png들을 한 계정의 펫으로 저장. 같은 이름이 있으면 건너뜀
// 실행: node --env-file=.env scripts/import-pet.mts <아이디> <펫 이름> <그림 폴더>
//   운영 DB에 넣을 때는 DATABASE_URL을 운영 주소로 바꿔서(scripts/update.ps1의 마이그레이션 단계처럼)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../src/lib/db.ts";
import { PET_POSES, type PetPose } from "../src/lib/pet-fit.ts";
import { createPet, myPets } from "../src/server/pets.ts";

const [username, name, dir] = process.argv.slice(2);
if (!username || !name || !dir) throw new Error("사용법: import-pet.mts <아이디> <펫 이름> <그림 폴더>");

try {
  const { rows } = await pool.query<{ id: string }>(`select id from "user" where username = $1`, [username.toLowerCase()]);
  if (!rows[0]) throw new Error(`계정 없음: ${username}`);
  const ctx = { userId: rows[0].id, actor: "user" as const };
  if ((await myPets(ctx)).some((p) => p.name === name)) {
    console.log(`이미 있음: ${name}`);
  } else {
    const files: Partial<Record<PetPose, Buffer>> = {};
    for (const f of readdirSync(dir)) {
      const pose = f.replace(/\.png$/i, "") as PetPose;
      if (PET_POSES.includes(pose)) files[pose] = readFileSync(join(dir, f));
    }
    const pet = await createPet(ctx, name, files);
    console.log(`추가함: ${name} (${pet.poses.join(", ")})`);
  }
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}
