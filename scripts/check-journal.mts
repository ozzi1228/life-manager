// 일기·사진 규칙(src/server/journal.ts·files.ts) 확인: node --env-file=.env scripts/check-journal.mts (개발 DB, 사진은 임시 폴더)
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import sharp from "sharp";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const dir = mkdtempSync(join(tmpdir(), "oona-files-"));
process.env.OONA_FILES_DIR = dir;

const { db } = await import("../src/db/index.ts");
const { attachments, journalEntries, journalTopics, revisions } = await import("../src/db/schema.ts");
const { AppError } = await import("../src/server/errors.ts");
const { readImage, saveImage } = await import("../src/server/files.ts");
const { createEntry, entryWithPhotos, monthEntries, topicList, updateEntry } = await import("../src/server/journal.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-jrn-a", actor: "user" };
const B: Ctx = { userId: "check-jrn-b", actor: "user" };
const users = [A.userId, B.userId];
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? e.code : String(e)));

try {
  // 사진: 실제 디코딩, 크기 줄임, 위치 정보(EXIF) 제거
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#5B8DEF" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret-location" } })
    .toBuffer();
  const p1 = await saveImage(A, big, "journal_photo");
  assert.deepEqual([p1.width, p1.height], [1280, 853]);
  const body = await readImage(A, p1.id, "body");
  assert.equal((await sharp(body).metadata()).exif, undefined, "메타데이터 제거");
  assert.equal((await sharp(await readImage(A, p1.id, "thumb")).metadata()).width, 320);
  assert.equal(await code(readImage(B, p1.id, "body")), "NOT_FOUND", "남의 사진은 못 봄");
  assert.equal(await code(saveImage(A, Buffer.from("not an image"), "journal_photo")), "VALIDATION_FAILED");

  // 글: 빈 글 불가, 사진 연결·순서, 남의 사진 불가, 빠진 사진은 휴지통
  const topics = await topicList(A);
  assert.deepEqual(topics.map((t) => t.name), ["일상", "회고", "감사", "여행", "생각", "업무"]);
  assert.equal(await code(createEntry(A, { date: "2026-11-01", bodyMd: "  " })), "VALIDATION_FAILED");
  const p2 = await saveImage(A, big, "journal_photo");
  const pb = await saveImage(B, big, "journal_photo");
  assert.equal(await code(createEntry(A, { date: "2026-11-01", bodyMd: "x", photoIds: [pb.id] })), "VALIDATION_FAILED", "남의 사진 연결 불가");
  const e = await createEntry(A, { date: "2026-11-01", topicId: topics[0].id, title: "첫 일기", bodyMd: "본문", photoIds: [p2.id, p1.id] });
  assert.deepEqual((await entryWithPhotos(A, e.id)).photos.map((p) => p.id), [p2.id, p1.id]);
  assert.equal(await code(createEntry(A, { date: "2026-11-02", bodyMd: "y", photoIds: [p1.id] })), "VALIDATION_FAILED", "다른 글에 붙은 사진 불가");
  const u = await updateEntry(A, e.id, e.version, { date: "2026-11-01", title: "첫 일기", bodyMd: "본문", photoIds: [p1.id] });
  assert.equal(u.version, 2);
  assert.deepEqual((await entryWithPhotos(A, e.id)).photos.map((p) => p.id), [p1.id]);
  assert.equal(await code(readImage(A, p2.id, "body")), "NOT_FOUND", "빠진 사진은 휴지통");
  assert.equal((await monthEntries(A, "2026-11")).length, 1);
  assert.equal((await monthEntries(B, "2026-11")).length, 0);
  assert.equal(await code(createEntry(B, { date: "2026-11-01", bodyMd: "x", topicId: topics[0].id })), "VALIDATION_FAILED", "남의 주제 불가");
  console.log("일기·사진 규칙 확인 통과", `(사진 파일 ${readdirSync(join(dir, A.userId), { recursive: true }).length}개)`);
} finally {
  for (const t of [journalEntries, journalTopics, attachments, revisions]) await db.delete(t).where(inArray(t.userId, users));
  rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
