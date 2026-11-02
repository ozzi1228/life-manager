// 사진 저장 (17 M-06, 08 §2.4, 15 §2.9): 앱 서버가 받아 이 PC 데이터 폴더(.env OONA_FILES_DIR)에 저장
// - 실제로 디코딩해서 형식 확인(확장자 믿지 않음), 회전 보정, 위치 등 메타데이터 제거(출력에 EXIF를 넣지 않음)
// - 변형: 썸네일 320px·본문 1280px WebP. ponytail: 원본은 보관하지 않음(Q-071 미결정 — 정해지면 원본 보관 추가)
// - 내려받기는 소유자 확인 후 이 서버가 직접 보냄(같은 주소, 로그인 쿠키) — 서명 주소가 필요해지면 클라우드 이전 때
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type Metadata } from "sharp";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, type Tx } from "../db/index.ts";
import { uuidv7 } from "../db/id.ts";
import { attachments } from "../db/schema.ts";
import { AppError } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";

export const attachmentRepo = defineRepo(attachments, "attachment");

const MAX_BYTES = 20 * 1024 * 1024;
const VARIANTS = { thumb: 320, body: 1280 } as const;
export type Variant = keyof typeof VARIANTS;

function filesDir() {
  const d = process.env.OONA_FILES_DIR;
  if (!d) throw new AppError("INTERNAL", "잠시 후 다시 시도해 주세요");
  return d;
}

export const PURPOSES = ["journal_photo", "media_cover", "wish_image"] as const;

export async function saveImage(ctx: Ctx, input: Buffer, purpose: (typeof PURPOSES)[number]) {
  if (input.length > MAX_BYTES) throw new AppError("BAD_REQUEST", "사진은 20MB까지 올릴 수 있어요");
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new AppError("VALIDATION_FAILED", "사진 파일을 읽을 수 없어요. JPEG·PNG·WebP로 올려 주세요");
  }
  if (!["jpeg", "png", "webp", "gif"].includes(meta.format)) throw new AppError("VALIDATION_FAILED", "JPEG·PNG·WebP 사진만 올릴 수 있어요");

  const id = uuidv7();
  const key = `${ctx.userId}/${new Date().getFullYear()}/${id}`;
  const dir = join(filesDir(), ctx.userId, String(new Date().getFullYear()));
  await mkdir(dir, { recursive: true });
  const base = sharp(input).rotate(); // EXIF 방향대로 돌린 뒤 버림
  let size = { width: 0, height: 0 };
  for (const [name, px] of Object.entries(VARIANTS)) {
    const { data, info } = await base.clone().resize({ width: px, height: px, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    await writeFile(join(dir, `${id}-${name}.webp`), data);
    if (name === "body") size = { width: info.width, height: info.height };
  }
  const [row] = await db
    .insert(attachments)
    .values({ id, userId: ctx.userId, purpose, storageKey: key, ...size, bytes: input.length, sha256: createHash("sha256").update(input).digest("hex") })
    .returning();
  return { id: row.id, width: row.width, height: row.height };
}

/** 내 사진 파일 읽기(지운 것·남의 것은 404) */
export async function readImage(ctx: Ctx, id: string, variant: Variant) {
  const a = await attachmentRepo.get(ctx, id);
  try {
    return await readFile(join(filesDir(), ...a.storageKey.split("/").slice(0, -1), `${id}-${variant}.webp`));
  } catch {
    throw new AppError("NOT_FOUND", "찾을 수 없어요");
  }
}

/**
 * 사진을 글 등에 연결: 내 사진이고 아직 어디에도 안 붙었거나 이미 이 대상에 붙은 것만. 순서도 저장.
 * 이 대상에 붙어 있다가 목록에서 빠진 사진은 휴지통으로(대상과 같은 묶음 → 대상 복구 때 함께 복구되지 않게 따로)
 */
export async function linkImages(tx: Tx, ctx: Ctx, ownerType: string, ownerId: string, ids: string[]) {
  if (ids.length > 10) throw new AppError("VALIDATION_FAILED", "사진은 10장까지 넣을 수 있어요");
  const current = await tx
    .select({ id: attachments.id, ownerId: attachments.ownerId })
    .from(attachments)
    .where(and(eq(attachments.userId, ctx.userId), isNull(attachments.deletedAt), or(and(eq(attachments.ownerType, ownerType), eq(attachments.ownerId, ownerId)), ids.length ? inArray(attachments.id, ids) : undefined)));
  for (const [i, id] of ids.entries()) {
    const a = current.find((c) => c.id === id);
    if (!a || (a.ownerId && a.ownerId !== ownerId)) throw new AppError("VALIDATION_FAILED", "사진을 다시 올려 주세요");
    await tx.update(attachments).set({ ownerType, ownerId, sort: i }).where(eq(attachments.id, id));
  }
  for (const a of current) if (a.ownerId === ownerId && !ids.includes(a.id)) await attachmentRepo.remove(ctx, a.id, { tx });
}

/** 여러 대상의 사진 목록(순서대로) */
export async function imagesOf(ctx: Ctx, ownerType: string, ownerIds: string[]) {
  if (!ownerIds.length) return new Map<string, { id: string; width: number; height: number }[]>();
  const rows = await db
    .select({ id: attachments.id, ownerId: attachments.ownerId, width: attachments.width, height: attachments.height, sort: attachments.sort })
    .from(attachments)
    .where(and(eq(attachments.userId, ctx.userId), eq(attachments.ownerType, ownerType), inArray(attachments.ownerId, ownerIds), isNull(attachments.deletedAt)));
  const map = new Map<string, { id: string; width: number; height: number }[]>();
  for (const r of rows.sort((a, b) => a.sort - b.sort)) map.set(r.ownerId!, [...(map.get(r.ownerId!) ?? []), { id: r.id, width: r.width, height: r.height }]);
  return map;
}

/** 영구 삭제: 사진 파일(변형 전부) 지우기. 없는 파일은 넘어감 */
export async function removeImageFiles(storageKeys: string[]) {
  for (const key of storageKeys) {
    const parts = key.split("/");
    const id = parts.at(-1)!;
    for (const v of Object.keys(VARIANTS)) await rm(join(filesDir(), ...parts.slice(0, -1), `${id}-${v}.webp`), { force: true });
  }
}
