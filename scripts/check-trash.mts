// 휴지통·변경 기록 규칙(src/server/trash.ts·history.ts) 확인: node --env-file=.env scripts/check-trash.mts (개발 DB, 사진은 임시 폴더)
// 묶음 한 줄, 복구, 영구 삭제(이력·사진 파일까지), 90일 지나면 정리, 남의 것 막기, 지출 변경 기록
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const dir = mkdtempSync(join(tmpdir(), "oona-files-"));
process.env.OONA_FILES_DIR = dir;

const { db } = await import("../src/db/index.ts");
const s = await import("../src/db/schema.ts");
const { createTransaction, formData, txRepo, updateTransaction } = await import("../src/server/finance.ts");
const { calendarList, createCalendar, createEvent, deleteCalendar } = await import("../src/server/calendar.ts");
const { createWish, wishRepo } = await import("../src/server/wish.ts");
const { saveImage } = await import("../src/server/files.ts");
const { historyOf } = await import("../src/server/history.ts");
const { purge, restoreBatch, trashView } = await import("../src/server/trash.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-trash-a", actor: "user" };
const B: Ctx = { userId: "check-trash-b", actor: "user" };
const users = [A.userId, B.userId];

try {
  const food = (await formData(A)).categories.find((c) => c.name === "식비")!;
  const t = (await createTransaction(A, { type: "expense", amount: 12000, date: "2026-11-02", categoryId: food.id, title: "점심" })).row;
  await updateTransaction(A, t.id, t.version, { type: "expense", amount: 13000, date: "2026-11-02", categoryId: food.id, title: "점심" });
  const h = await historyOf(A, "transaction", t.id);
  assert.deepEqual([h[0].action, h[0].changes], ["고침", [{ label: "금액", before: "12,000원", after: "13,000원" }]]);
  assert.equal(h.at(-1)?.action, "만듦");
  assert.equal((await historyOf(B, "transaction", t.id)).length, 0, "남의 기록은 안 보임");

  // 묶음 한 줄: 캘린더를 지우면 일정도 함께, 대표는 캘린더
  await calendarList(A);
  const cal = await createCalendar(A, { name: "회사", colorHex: "#5B8DEF" });
  await createEvent(A, { calendarId: cal.id, title: "회의", startDate: "2026-11-05", startTime: "10:00", endDate: "2026-11-05", endTime: "11:00" });
  await createEvent(A, { calendarId: cal.id, title: "회식", startDate: "2026-11-06", startTime: "19:00", endDate: "2026-11-06", endTime: "21:00" });
  await deleteCalendar(A, cal.id);
  await txRepo.remove(A, t.id);
  let list = await trashView(A);
  assert.deepEqual(
    list.map((x) => [x.area, x.name, x.others, x.daysLeft]),
    [
      ["지출", "점심 · 13,000원", 0, 90],
      ["일정", "회사 캘린더", 2, 90],
    ],
  );
  assert.equal((await trashView(B)).length, 0, "남의 휴지통은 비어 있음");

  // 복구: 묶음 전체
  await restoreBatch(A, list[1].entity, list[1].id);
  assert.equal((await trashView(A)).length, 1);
  assert.equal((await db.select().from(s.events).where(and(eq(s.events.userId, A.userId)))).filter((e) => !e.deletedAt).length, 2, "일정도 함께 복구");

  // 영구 삭제: 행·변경 이력·붙은 사진 파일까지
  const img = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#ccc" } }).png().toBuffer();
  const photo = await saveImage(A, img, "wish_image");
  const w = await createWish(A, { kind: "shopping", name: "가방", price: 100000, photoIds: [photo.id] });
  await wishRepo.remove(A, w.id);
  list = await trashView(A);
  const wishRow = list.find((x) => x.name === "가방")!;
  assert.ok(readdirSync(dir, { recursive: true }).some((f) => String(f).includes(photo.id)), "사진 파일 있음");
  await purge(B, [wishRow.batchId]);
  assert.ok((await trashView(A)).some((x) => x.name === "가방"), "남의 것은 못 지움");
  await purge(A, [wishRow.batchId]);
  assert.equal((await db.select().from(s.wishItems).where(eq(s.wishItems.id, w.id))).length, 0);
  assert.equal((await db.select().from(s.revisions).where(eq(s.revisions.entityId, w.id))).length, 0, "변경 이력도 지움");
  assert.equal((await db.select().from(s.attachments).where(eq(s.attachments.id, photo.id))).length, 0);
  assert.ok(!readdirSync(dir, { recursive: true }).some((f) => String(f).includes(photo.id)), "사진 파일도 지움");
  const [log] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.userId, A.userId), eq(s.auditLogs.event, "trash.purge")));
  assert.ok(log, "보안 기록에 남음");

  // 90일 지나면 열 때 정리
  assert.equal((await trashView(A, new Date(Date.now() + 91 * 86_400_000))).length, 0);
  assert.equal((await db.select().from(s.transactions).where(eq(s.transactions.id, t.id))).length, 0, "보존 기간 지난 지출은 영구 삭제");
  assert.ok(existsSync(dir));
  console.log("휴지통·변경 기록 규칙 확인 통과");
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [s.transactions, s.finCategories, s.paymentMethods, s.events, s.eventExceptions, s.calendars, s.wishItems, s.attachments, s.revisions, s.auditLogs]) await db.delete(t).where(inArray(t.userId, users));
  rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
