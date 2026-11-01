// 내 펫 (11 §5, 15 §2 /api/v1/pets) 1차: 본인 계정에서만 보이는 펫. 그림은 데이터 폴더에, 저장소(git)에는 올리지 않음
// 지금은 scripts/import-pet.mts로 넣음. ponytail: 업로드 화면·수정·삭제는 C-03
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { asc } from "drizzle-orm";
import { db } from "../db/index.ts";
import { pets } from "../db/schema.ts";
import { fitPet, PET_POSES, type PetPose } from "../lib/pet-fit.ts";
import { AppError, notFound } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";

export const petRepo = defineRepo(pets, "pet");

const petDir = (userId: string, id: string) => {
  const root = process.env.OONA_FILES_DIR;
  if (!root) throw new AppError("INTERNAL", "잠시 후 다시 시도해 주세요");
  return join(root, userId, "pets", id);
};

export async function myPets(ctx: Ctx) {
  const rows = await petRepo.list(ctx, { orderBy: [asc(pets.createdAt)] });
  return rows.map((p) => ({ id: p.id, name: p.name, poses: p.poses }));
}

/** 동작별 원본 그림으로 내 펫 만들기(256px로 맞춰 저장) */
export async function createPet(ctx: Ctx, name: string, files: Partial<Record<PetPose, Buffer>>) {
  if (!name.trim()) throw new AppError("VALIDATION_FAILED", "이름을 입력해 주세요");
  if (!files.idle) throw new AppError("VALIDATION_FAILED", "가만히 있는 그림(idle)이 꼭 있어야 해요");
  const { images } = await fitPet(files);
  // 파일 쓰기가 실패하면 행도 남기지 않음
  return db.transaction(async (tx) => {
    const row = await petRepo.create(ctx, { name: name.trim(), poses: Object.keys(images) }, { tx });
    const dir = petDir(ctx.userId, row.id);
    await mkdir(dir, { recursive: true });
    for (const [pose, buf] of Object.entries(images)) await writeFile(join(dir, `${pose}.png`), buf);
    return row;
  });
}

/** 내 펫 그림 한 장. 없는 동작은 idle로 */
export async function petImage(ctx: Ctx, id: string, pose: string) {
  const p = await petRepo.get(ctx, id);
  const use = PET_POSES.includes(pose as PetPose) && p.poses.includes(pose) ? pose : "idle";
  try {
    return await readFile(join(petDir(ctx.userId, id), `${use}.png`));
  } catch {
    throw notFound();
  }
}
