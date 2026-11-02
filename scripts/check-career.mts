// 커리어·기간 메모 규칙(src/server/career.ts·calendar.ts 메모) 확인: node --env-file=.env scripts/check-career.mts (개발 DB, 파일은 임시 폴더)
// 경험 검증, 문서·버전(링크+파일 여러 형식), 이름만 바꾼 파일 막기, 문서 지우면 버전도 함께, 영구 삭제 때 파일까지, 메모 저장·충돌
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inArray } from "drizzle-orm";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const dir = mkdtempSync(join(tmpdir(), "oona-files-"));
process.env.OONA_FILES_DIR = dir;

const { db } = await import("../src/db/index.ts");
const s = await import("../src/db/schema.ts");
const { AppError } = await import("../src/server/errors.ts");
const { readDocFile, saveFile } = await import("../src/server/files.ts");
const career = await import("../src/server/career.ts");
const { getNote, periodKey, saveNote } = await import("../src/server/calendar.ts");
const { purge, trashView } = await import("../src/server/trash.ts");
const { formatOf } = await import("../src/lib/career.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-career-a", actor: "user" };
const B: Ctx = { userId: "check-career-b", actor: "user" };
const users = [A.userId, B.userId];
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? (e.extra.fields?.[0]?.message ?? e.message ?? e.code) : String(e)));

try {
  // 형식 이름
  assert.equal(formatOf({ type: "link", url: "https://app.notion.com/p/abc", name: null }), "Notion");
  assert.equal(formatOf({ type: "link", url: "https://me.notion.site/x", name: null }), "Notion");
  assert.equal(formatOf({ type: "link", url: "https://docs.google.com/document/d/1", name: null }), "Google");
  assert.equal(formatOf({ type: "file", url: null, name: "이력서_v3.PPTX" }), "PPT");

  // 경험
  assert.equal(await code(career.createExp(A, { title: " " })), "제목을 입력해 주세요");
  assert.equal(await code(career.createExp(A, { title: "x", startMonth: "2025-03", endMonth: "2024-01" })), "끝난 달이 시작한 달보다 빨라요");
  await career.createExp(A, { title: "옛 프로젝트", startMonth: "2023-01", endMonth: "2023-06", tags: ["협업", "협업", "Python"] });
  const now = await career.createExp(A, { title: "지금 하는 일", type: "work", startMonth: "2024-03", body: "## 상황\n..." });
  const list = await career.expList(A);
  assert.deepEqual(list.map((e) => e.title), ["지금 하는 일", "옛 프로젝트"], "진행 중 먼저");
  assert.deepEqual(list[1].tags, ["협업", "Python"], "태그 중복 제거");
  assert.equal((await career.expList(B)).length, 0);
  assert.equal(await code(career.updateExp(B, now.id, now.version, { title: "남의 것" })), "찾을 수 없어요");

  // 파일: 확장자와 실제 머리가 맞아야
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200)]);
  assert.equal(await code(saveFile(A, Buffer.from("MZ not a pdf"), "이력서.pdf")), "PDF·Word·PPT·한글 파일만 올릴 수 있어요");
  assert.equal(await code(saveFile(A, pdf, "virus.exe")), "PDF·Word·PPT·한글 파일만 올릴 수 있어요");
  const f = await saveFile(A, pdf, "이력서_v1.pdf");
  assert.equal((await readDocFile(A, f.id)).name, "이력서_v1.pdf");
  assert.equal(await code(readDocFile(B, f.id)), "찾을 수 없어요", "남의 파일은 못 받음");

  // 문서·버전: 같은 버전에 Notion 링크 + PDF
  const doc = await career.createDoc(A, { kind: "resume", title: "백엔드 이력서" });
  await career.saveVersion(A, doc.id, null, null, { label: "v1", items: [{ type: "link", url: "app.notion.com/p/abc" }, { type: "file", attachmentId: f.id }] });
  let docs = await career.docList(A);
  assert.deepEqual(docs[0].versions[0].items.map((i) => [i.type, i.url ?? i.name]), [["link", "https://app.notion.com/p/abc"], ["file", "이력서_v1.pdf"]]);
  const fB = await saveFile(B, pdf, "남.pdf");
  assert.equal(await code(career.saveVersion(A, doc.id, null, null, { label: "v2", items: [{ type: "file", attachmentId: fB.id }] })), "파일을 다시 올려 주세요", "남의 파일 못 붙임");

  // 문서를 지우면 버전도 한 묶음 → 영구 삭제 때 파일까지
  await career.removeDoc(A, doc.id);
  docs = await career.docList(A);
  assert.equal(docs.length, 0);
  const t = (await trashView(A)).find((x) => x.name === "백엔드 이력서")!;
  assert.equal(t.others, 1, "버전 1개 함께");
  assert.ok(readdirSync(dir, { recursive: true }).some((n) => String(n).includes(f.id)));
  await purge(A, [t.batchId]);
  assert.ok(!readdirSync(dir, { recursive: true }).some((n) => String(n).includes(f.id)), "문서 파일도 지움");

  // 기간 메모: 키, 저장·고치기, 다른 기기 충돌
  assert.deepEqual([periodKey("year", "2026-11-02"), periodKey("month", "2026-11-02"), periodKey("week", "2026-11-04"), periodKey("day", "2026-11-02")], ["2026", "2026-11", "2026-11-01", "2026-11-02"]);
  const n1 = await saveNote(A, "month", "2026-11", "이번 달: 이력서 고치기", null);
  const n2 = await saveNote(A, "month", "2026-11", "이번 달: 이력서 고치기, 포트폴리오", n1.version);
  assert.equal((await getNote(A, "month", "2026-11"))?.body, "이번 달: 이력서 고치기, 포트폴리오");
  assert.equal(await code(saveNote(A, "month", "2026-11", "옛 화면", n1.version)), "다른 기기에서 먼저 수정했어요");
  assert.equal(await code(saveNote(A, "month", "2026-11", "새로", null)), "다른 기기에서 먼저 수정했어요", "다른 기기가 먼저 만든 메모");
  assert.equal(await getNote(B, "month", "2026-11"), null, "남의 메모는 안 보임");
  assert.equal(n2.version, n1.version + 1);
  console.log("커리어·기간 메모 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [s.careerExperiences, s.careerDocs, s.careerDocVersions, s.periodNotes, s.attachments, s.revisions, s.auditLogs]) await db.delete(t).where(inArray(t.userId, users));
  rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
