// 메모 규칙(src/server/memos.ts) 확인: node --env-file=.env scripts/check-memos.mts (개발 DB)
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");

const { db } = await import("../src/db/index.ts");
const { memos, revisions } = await import("../src/db/schema.ts");
const { AppError } = await import("../src/server/errors.ts");
const { createMemo, deleteMemo, getMemo, memoList, updateMemo } = await import("../src/server/memos.ts");
const { searchAll } = await import("../src/server/search.ts");
const { trashView } = await import("../src/server/trash.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-memo-a", actor: "user" };
const B: Ctx = { userId: "check-memo-b", actor: "user" };
const users = [A.userId, B.userId];
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? e.code : String(e)));
const clean = async () => {
  await db.delete(memos).where(inArray(memos.userId, users));
  await db.delete(revisions).where(inArray(revisions.userId, users));
};

const { mdText } = await import("../src/lib/md-text.ts");
assert.equal(mdText("# 제목\n\n- [x] **우유** 사기\n- `두부`\n\n> 인용 [링크](https://a.b)"), "제목\n우유 사기\n두부\n인용 링크");
assert.equal(mdText("1. *하나*\n2. ~~둘~~\n\n가\\_나"), "하나\n둘\n가_나");

await clean();
try {
  assert.equal(await code(createMemo(A, { title: " ", body: "  " })), "VALIDATION_FAILED"); // 둘 다 비면 안 됨
  const m = await createMemo(A, { title: "장보기", body: "우유\n계란" });
  await createMemo(A, { title: "", body: "제목 없이도 됨" });
  assert.equal(await code(getMemo(B, m.id)), "NOT_FOUND"); // 남의 메모
  const v2 = await updateMemo(A, m.id, m.version, { title: "장보기 목록", body: "우유\n계란\n두부" });
  assert.equal(await code(updateMemo(A, m.id, m.version, { title: "x", body: "" })), "VERSION_CONFLICT");
  assert.equal((await memoList(A))[0].id, m.id); // 최근에 고친 게 위로
  const hits = (await searchAll(A, "두부")).find((g) => g.key === "memos")?.hits ?? [];
  assert.equal(hits[0]?.href, `/records/memos/${m.id}`);
  await deleteMemo(A, v2.id);
  assert.equal((await memoList(A)).length, 1);
  assert.ok(JSON.stringify(await trashView(A)).includes("장보기 목록")); // 휴지통에 보임
  console.log("메모 확인 끝: 모두 통과");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await clean();
  process.exit();
}
