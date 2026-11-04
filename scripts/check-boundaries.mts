// 입력 경계값(22 §3 표 + 글자 종류) 서버 규칙 확인: node --env-file=.env --no-warnings scripts/check-boundaries.mts (개발 DB, 사진은 임시 폴더)
// 글자 규칙은 각 기능 함수가 맨 먼저 부르는 parse(스키마)로 바로 확인(참조 확인·DB 전 단계). 일기·사진은 실제 함수로.
// 문서 기대와 다르면 멈추지 않고 모아서 끝에 보여 주고 실패로 끝냄
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inArray } from "drizzle-orm";

if (!process.env.DATABASE_URL?.endsWith("/oona_dev")) throw new Error("개발 DB(oona_dev)에서만 실행해요");
const dir = mkdtempSync(join(tmpdir(), "oona-files-"));
process.env.OONA_FILES_DIR = dir;

const { db } = await import("../src/db/index.ts");
const { attachments, journalEntries, revisions } = await import("../src/db/schema.ts");
const { AppError } = await import("../src/server/errors.ts");
const { parse } = await import("../src/server/validate.ts");
const { saveImage } = await import("../src/server/files.ts");
const { createEntry } = await import("../src/server/journal.ts");
const { txInput } = await import("../src/server/finance.ts");
const { mediaInput } = await import("../src/server/media.ts");
const { wishInput } = await import("../src/server/wish.ts");
const { eventInput } = await import("../src/server/calendar.ts");
const { itemInput, cellInput } = await import("../src/server/goals.ts");
const { recurringInput } = await import("../src/server/recurring.ts");
const { cardInput } = await import("../src/server/cards.ts");
const { healthInput } = await import("../src/server/health.ts");
const { expInput } = await import("../src/server/career.ts");
const { restraintInput } = await import("../src/server/restraint.ts");
type Ctx = import("../src/server/repo.ts").Ctx;

const A: Ctx = { userId: "check-bnd-a", actor: "user" };
const err = (e: unknown) => (e instanceof AppError ? e.code : String(e));
const code = (p: Promise<unknown>) => p.then(() => "ok", err);
const V = "VALIDATION_FAILED";
const bad: string[] = [];
const info: string[] = [];
let n = 0;
const short = (x: unknown) => { const s = JSON.stringify(x); return s.length > 120 ? `${s.slice(0, 100)}…(${s.length}자)` : s; };
// 스키마에 base+patch를 넣어 결과 코드가 want와 같은지
type S = Parameters<typeof parse>[0];
const t = (area: string, s: S, base: object, patch: object, want: string) => {
  n++;
  let got = "ok";
  try { parse(s, { ...base, ...patch }); } catch (e) { got = err(e); }
  if (got !== want) bad.push(`[${area}] ${short(patch)} → 기대 ${want}, 실제 ${got}`);
};
const out = (s: S, input: object) => parse(s, input) as Record<string, unknown>;
// 길이 L 바로 아래·정확히·바로 위
const len3 = (area: string, s: S, base: object, key: string, L: number, wrap = (x: string): unknown => x) => {
  t(area, s, base, { [key]: wrap("가".repeat(L - 1)) }, "ok");
  t(area, s, base, { [key]: wrap("가".repeat(L)) }, "ok");
  t(area, s, base, { [key]: wrap("가".repeat(L + 1)) }, V);
};
const amount3 = (area: string, s: S, base: object, key = "amount") => {
  for (const x of [1, 9_999_999_999, 10_000_000_000]) t(area, s, base, { [key]: x }, "ok");
  for (const x of [0, 10_000_000_001, -1000, 1.5, "1,000", "１０００", "1000"]) t(area, s, base, { [key]: x }, V);
};
const U = () => randomUUID();
const D = "2026-11-01";
const FAM = "👩‍👩‍👧"; // 보이는 글자 1개, UTF-16 8칸

try {
  // 지출: 금액·내용·메모·태그
  const tx = { type: "expense", amount: 1000, date: D, categoryId: U() };
  amount3("지출", txInput, tx);
  len3("지출 내용", txInput, tx, "title", 60);
  len3("지출 메모", txInput, tx, "memo", 1000);
  t("지출 태그", txInput, tx, { tags: Array.from({ length: 30 }, (_, i) => `t${i}`) }, "ok");
  t("지출 태그", txInput, tx, { tags: Array.from({ length: 31 }, (_, i) => `t${i}`) }, V);
  t("지출 태그", txInput, tx, { tags: ["가".repeat(101)] }, V);
  // 태그는 화면이 10개·20자로 막고 서버는 30개·100자까지 받아 정리(cleanTags: 10개·20자, 22 §3)
  const tags = out(txInput, { ...tx, tags: Array.from({ length: 30 }, (_, i) => `태그${i}`) }).tags as string[];
  if (tags.length !== 10) bad.push(`[지출 태그] 서로 다른 태그 30개 → 기대 10개로 정리, 실제 ${tags.length}개`);
  const long = (out(txInput, { ...tx, tags: ["가".repeat(100)] }).tags as string[])[0];
  if (long.length !== 20) bad.push(`[지출 태그] 100자 태그 → 기대 20자로 정리, 실제 ${long.length}자`);
  const dup = out(txInput, { ...tx, tags: ["같음", "같음", "   ", "#a,b"] }).tags;
  info.push(`지출 태그 ["같음","같음","   ","#a,b"] → ${short(dup)} (중복·공백만 태그는 조용히 빠짐)`);

  // 일기: 제목·본문·사진 (실제 createEntry)
  const J = async (area: string, input: object, want: string) => {
    n++;
    const got = await code(createEntry(A, { date: D, ...input }));
    if (got !== want) bad.push(`[${area}] ${short(input)} → 기대 ${want}, 실제 ${got}`);
  };
  await J("일기 제목만", { title: "제목만" }, "ok");
  await J("일기 제목", { title: "가".repeat(100) }, "ok");
  await J("일기 제목", { title: "가".repeat(101) }, V);
  await J("일기 본문", { bodyMd: "가".repeat(50_000) }, "ok"); // 5만 자 한 줄(줄바꿈 없음)
  await J("일기 본문", { bodyMd: "가".repeat(50_001) }, V);
  await J("일기 빈 글", { title: "   ", bodyMd: "\n\n \n" }, V); // 공백 제목 + 줄바꿈만 본문
  await J("일기 글자", { bodyMd: "<script>alert(1)</script> [x](javascript:alert(1)) مرحبا 안녕" }, "ok"); // 글자로 저장(그리기에서 막는지는 화면 확인)
  t("일기 사진", (await import("../src/server/journal.ts")).entryInput, { date: D, bodyMd: "x" }, { photoIds: Array.from({ length: 10 }, U) }, "ok");
  t("일기 사진", (await import("../src/server/journal.ts")).entryInput, { date: D, bodyMd: "x" }, { photoIds: Array.from({ length: 11 }, U) }, V);

  // 작품: 제목·한 줄 평·감상·별점
  const media = { kind: "book", title: "책", status: "done", endDate: D };
  len3("작품 제목", mediaInput, media, "title", 100);
  len3("작품 한 줄 평", mediaInput, media, "oneLiner", 100);
  len3("작품 감상", mediaInput, media, "review", 50_000);
  t("작품 제목", mediaInput, media, { title: "   " }, V);
  for (const r of [0.5, 4.5, 5]) t("작품 별점", mediaInput, media, { rating: r }, "ok");
  for (const r of [0, 5.5, 0.3]) t("작품 별점", mediaInput, media, { rating: r }, V);

  // 위시: 이름·가격·링크·사진
  const wish = { kind: "shopping", name: "가방", price: 1000 };
  len3("위시 이름", wishInput, wish, "name", 100);
  t("위시 이름", wishInput, wish, { name: " \t " }, V);
  amount3("위시 가격", wishInput, wish, "price");
  t("위시 링크", wishInput, wish, { links: Array.from({ length: 10 }, (_, i) => `https://a.com/${i}`) }, "ok");
  t("위시 링크", wishInput, wish, { links: Array.from({ length: 11 }, (_, i) => `https://a.com/${i}`) }, V);
  for (const l of ["javascript:alert(1)", "JavaScript:alert(1)", "<script>alert(1)</script>", "data:text/html,<script>alert(1)</script>", "잘못된 주소", "https://"]) t("위시 링크", wishInput, wish, { links: [l] }, V);
  // 다른 방식 주소는 앞에 https://가 붙어 통과함(실행은 안 되지만 깨진 링크로 저장)
  try { bad.push(`[위시 링크] ["ftp://a.com"] → 기대 ${V}, 실제 ok·저장값 ${short(out(wishInput, { ...wish, links: ["ftp://a.com"] }).links)}`); } catch { /* 거절되면 맞음 */ }
  n++;
  info.push(`위시 링크 "a.com/x" → ${short(out(wishInput, { ...wish, links: ["a.com/x"] }).links)} (https:// 자동으로 붙임)`);
  t("위시 사진", wishInput, wish, { photoIds: Array.from({ length: 11 }, U) }, V);

  // 일정: 제목·장소·메모
  const ev = { calendarId: U(), title: "회의", allDay: true, startDate: D, endDate: D };
  len3("일정 제목", eventInput, ev, "title", 100);
  len3("일정 장소", eventInput, ev, "location", 200);
  len3("일정 메모", eventInput, ev, "memo", 2000);
  t("일정 제목", eventInput, ev, { title: "  " }, V);
  t("일정 자정 넘김", eventInput, ev, { allDay: false, startTime: "23:00", endDate: "2026-11-02", endTime: "01:00" }, "ok");

  // 목표·습관: 이름·칸 메모
  const item = { name: "운동", colorHex: "#5B8DEF" };
  len3("습관 이름", itemInput, item, "name", 60);
  t("습관 이름", itemInput, item, { name: "   " }, V);
  len3("습관 칸 메모", cellInput, { itemId: U(), date: D, done: true }, "memo", 40);

  // 고정 지출: 이름·금액·날짜·N개월
  const rec = { name: "넷플릭스", amount: 13500, cycle: "monthly", dayOfMonth: 15 };
  len3("고정 지출 이름", recurringInput, rec, "name", 40);
  t("고정 지출 이름", recurringInput, rec, { name: "  " }, V);
  amount3("고정 지출", recurringInput, rec);
  for (const d of [1, 31]) t("고정 지출 날짜", recurringInput, rec, { dayOfMonth: d }, "ok");
  t("고정 지출 날짜", recurringInput, rec, { dayOfMonth: 32 }, V);
  const nm = { ...rec, cycle: "every_n_months", anchorMonth: "2026-11" };
  for (const m of [2, 12]) t("고정 지출 N개월", recurringInput, nm, { intervalMonths: m }, "ok");
  for (const m of [1, 13]) t("고정 지출 N개월", recurringInput, nm, { intervalMonths: m }, V);
  const yr = { ...rec, cycle: "yearly" };
  for (const m of [1, 12]) t("고정 지출 월", recurringInput, yr, { monthOfYear: m }, "ok");
  for (const m of [0, 13]) t("고정 지출 월", recurringInput, yr, { monthOfYear: m }, V);

  // 카드: 이름·결제일·연회비
  const card = { name: "카드" };
  len3("카드 이름", cardInput, card, "name", 20);
  t("카드 이름", cardInput, card, { name: "   " }, V);
  for (const d of [1, 31]) t("카드 결제일", cardInput, card, { billingDay: d }, "ok");
  for (const d of [0, 32]) t("카드 결제일", cardInput, card, { billingDay: d }, V);
  for (const f of [0, 10_000_000]) t("카드 연회비", cardInput, card, { annualFee: f }, "ok");
  for (const f of [-1, 10_000_001, 1.5]) t("카드 연회비", cardInput, card, { annualFee: f }, V);

  // 건강: 약 이름·용량·부위·메모·시간
  const inj = { kind: "injection", date: D, time: "09:00", injection: { name: "약" } };
  len3("건강 약 이름", healthInput, inj, "injection", 40, (x) => ({ name: x }));
  len3("건강 용량", healthInput, inj, "injection", 20, (x) => ({ name: "약", dose: x }));
  len3("건강 부위", healthInput, inj, "injection", 20, (x) => ({ name: "약", site: x }));
  len3("건강 메모", healthInput, inj, "memo", 500);
  t("건강 약 이름", healthInput, inj, { injection: { name: "  " } }, V);
  for (const h of ["00:00", "23:59"]) t("건강 시간", healthInput, inj, { time: h }, "ok");
  for (const h of ["24:00", "12:60", "9:00"]) t("건강 시간", healthInput, inj, { time: h }, V);

  // 커리어: 경험명·주요 활동·분류·키워드·링크·STAR
  const exp = { title: "경험" };
  len3("커리어 경험명", expInput, exp, "title", 100);
  t("커리어 경험명", expInput, exp, { title: "   " }, V);
  len3("커리어 주요 활동", expInput, exp, "body", 50_000);
  for (const [k, L] of [["categories", 10], ["tags", 20], ["links", 10]] as const) {
    const items = (m: number) => Array.from({ length: m }, (_, i) => (k === "links" ? `https://a.com/${i}` : `k${i}`));
    t(`커리어 ${k}`, expInput, exp, { [k]: items(L) }, "ok");
    t(`커리어 ${k}`, expInput, exp, { [k]: items(L + 1) }, V);
  }
  for (const l of ["javascript:alert(1)", "<script>alert(1)</script>"]) t("커리어 링크", expInput, exp, { links: [l] }, V);
  len3("커리어 STAR", expInput, exp, "star", 5000, (x) => ({ action: x }));

  // 참은 소비: 이름·금액
  const res = { name: "커피", amount: 5000, date: D };
  len3("참은 소비 이름", restraintInput, res, "name", 100);
  t("참은 소비 이름", restraintInput, res, { name: "  " }, V);
  amount3("참은 소비", restraintInput, res);

  // 글자 종류: zod 4 .max는 코드 포인트로 셈, 입력칸 maxLength는 UTF-16 칸으로 셈 → 서로 다름. 보이는 글자 수와도 다름. 기록만
  const title = (s: string) => { try { parse(mediaInput, { ...media, title: s }); return "ok"; } catch (e) { return err(e); } };
  info.push(`"${FAM}"는 보이는 글자 1·코드 포인트 ${[...FAM].length}·UTF-16 ${FAM.length}칸. 작품 제목(100자)에 13개(104칸) → ${title(FAM.repeat(13))}, 20개(코드 포인트 100) → ${title(FAM.repeat(20))}, 21개 → ${title(FAM.repeat(21))} (입력칸 maxLength=100이면 12개까지만 들어감)`);
  const nfd = "é".repeat(50);
  info.push(`결합 문자 é(e+´) 50개(코드 포인트 100) → ${title(nfd)}, +1자 → ${title(nfd + "x")} (화면엔 50·51글자) · 정규화(NFC) 안 함: 저장값 길이 ${(out(mediaInput, { ...media, title: nfd }).title as string).length}`);

  // 파일: 0바이트·20MB 정확히·20MB+1 (saveImage)
  n += 3;
  const MB20 = 20 * 1024 * 1024;
  const f0 = await code(saveImage(A, Buffer.alloc(0), "journal_photo"));
  if (f0 !== V) bad.push(`[파일] 0바이트 사진 → 기대 ${V}, 실제 ${f0}`);
  const fEq = await code(saveImage(A, Buffer.alloc(MB20), "journal_photo")); // 크기는 통과, 그림이 아니라 거절
  if (fEq !== V) bad.push(`[파일] 정확히 20MB(그림 아님) → 기대 ${V}(크기 통과 후 형식 거절), 실제 ${fEq}`);
  const fOver = await code(saveImage(A, Buffer.alloc(MB20 + 1), "journal_photo"));
  if (fOver !== "BAD_REQUEST") bad.push(`[파일] 20MB+1바이트 → 기대 BAD_REQUEST, 실제 ${fOver}`);

  console.log(`경계값 ${n}개 확인, 문서와 다른 것 ${bad.length}개`);
  for (const i of info) console.log("  참고:", i);
  for (const b of bad) console.log("  다름:", b);
  if (bad.length) process.exitCode = 1;
} catch (e) {
  // finally의 process.exit가 오류를 삼키지 않게 직접 알리고 실패로 끝냄
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const t of [journalEntries, attachments, revisions]) await db.delete(t).where(inArray(t.userId, [A.userId]));
  rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
