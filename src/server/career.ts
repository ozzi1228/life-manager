// 커리어 서비스: 경험 정리(앱 안에서 직접 쓰기) · 문서(이력서·자소서·포트폴리오) 버전별 링크·파일
// 버전의 파일은 attachments(owner_type=career_doc_version)로 붙임 → 버전을 지우면 휴지통, 영구 삭제 때 파일까지
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { uuidv7 } from "../db/id.ts";
import { attachments, careerDocs, careerDocVersions, careerExperiences, userSettings } from "../db/schema.ts";
import { dateKey, DEFAULT_CATEGORIES, defaultSections, EXP_SECTIONS, normDate, type ExpCategory } from "../lib/career.ts";
import { AppError } from "./errors.ts";
import { linkImages } from "./files.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const expRepo = defineRepo(careerExperiences, "career_experience");
export const docRepo = defineRepo(careerDocs, "career_doc");
export const versionRepo = defineRepo(careerDocVersions, "career_doc_version");
const OWNER = "career_doc_version";

const url = z
  .string()
  .trim()
  .max(2000)
  .transform((s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`))
  .pipe(z.url({ protocol: /^https?$/, error: "링크를 다시 확인해 주세요" }));

// ── 경험 정리(흔히 쓰는 경험 정리 양식: 기본·내용·STAR·자격·점수·비고) ──

const txt = (max: number, label: string) => z.string().trim().max(max, `${label}은 ${max}자까지 쓸 수 있어요`).nullable().default(null);
const day = z
  .string()
  .nullable()
  .default(null)
  .transform((t, c) => {
    if (!t?.trim()) return null;
    const n = normDate(t);
    if (!n) c.addIssue({ code: "custom", message: "날짜는 2024.06 또는 2024.06.01처럼 적어 주세요" });
    return n;
  });

export const expInput = z
  .object({
    title: z.string().trim().min(1, "경험명을 입력해 주세요").max(100, "경험명은 100자까지 쓸 수 있어요"),
    categories: z.array(z.string().trim().min(1).max(20, "분류는 20자까지 쓸 수 있어요")).max(10, "분류는 10개까지 넣을 수 있어요").default([]),
    organization: txt(60, "기관·소속"),
    role: txt(60, "역할·직무"),
    startText: day,
    endText: day,
    ongoing: z.boolean().default(false),
    body: z.string().max(50_000, "주요 활동은 5만 자까지 쓸 수 있어요").default(""),
    achievement: txt(5000, "성과"),
    learned: txt(5000, "배운 점"),
    tags: z.array(z.string().trim().min(1).max(20)).max(20, "역량 키워드는 20개까지 넣을 수 있어요").default([]),
    star: z.object({ situation: z.string().max(5000).optional(), task: z.string().max(5000).optional(), action: z.string().max(5000).optional(), result: z.string().max(5000).optional() }).default({}),
    score: txt(60, "점수"),
    issuer: txt(60, "발급 기관"),
    certNo: txt(60, "번호"),
    validUntil: day,
    note: txt(2000, "비고"),
    links: z.array(url).max(10, "링크는 10개까지 넣을 수 있어요").default([]),
  })
  .refine((v) => !v.startText || !v.endText || dateKey(v.startText)! <= dateKey(v.endText)!, { path: ["endText"], message: "끝난 날이 시작한 날보다 빨라요" })
  .transform((v) => ({
    ...v,
    categories: [...new Set(v.categories)],
    tags: [...new Set(v.tags)],
    endText: v.ongoing ? null : v.endText,
    periodStart: dateKey(v.startText),
    star: Object.fromEntries(Object.entries(v.star).filter(([, x]) => x?.trim())),
    organization: v.organization || null,
    role: v.role || null,
    achievement: v.achievement || null,
    learned: v.learned || null,
    score: v.score || null,
    issuer: v.issuer || null,
    certNo: v.certNo || null,
    note: v.note || null,
  }));
export type ExpInput = z.input<typeof expInput>;

export const createExp = async (ctx: Ctx, input: unknown, source?: string) => expRepo.create(ctx, parse(expInput, input), { source });
export const updateExp = async (ctx: Ctx, id: string, version: number, input: unknown) => expRepo.update(ctx, id, version, parse(expInput, input));

const toExp = (r: typeof careerExperiences.$inferSelect) => ({
  id: r.id,
  version: r.version,
  title: r.title,
  categories: r.categories,
  organization: r.organization,
  role: r.role,
  startText: r.startText,
  endText: r.endText,
  ongoing: r.ongoing,
  body: r.body,
  achievement: r.achievement,
  learned: r.learned,
  tags: r.tags,
  star: r.star,
  score: r.score,
  issuer: r.issuer,
  certNo: r.certNo,
  validUntil: r.validUntil,
  note: r.note,
  links: r.links,
});

/** 경험 목록: 진행 중 먼저, 그다음 시작일 최근 순(기간을 안 쓴 것은 맨 뒤) */
export async function expList(ctx: Ctx) {
  const rows = await expRepo.list(ctx, { orderBy: [sql`${careerExperiences.periodStart} desc nulls last`, desc(careerExperiences.createdAt)], limit: 1000 });
  return rows.map(toExp).sort((a, b) => Number(b.ongoing) - Number(a.ongoing));
}
export type Experience = Awaited<ReturnType<typeof expList>>[number];
export const getExp = async (ctx: Ctx, id: string) => toExp(await expRepo.get(ctx, id));

/** 분류 목록(순서대로): 분류 편집에서 고친 목록(없으면 기본 목록) + 경험에 붙어 있는데 목록에 없는 것 */
export async function expCategories(ctx: Ctx): Promise<ExpCategory[]> {
  const [row] = await db.select({ list: userSettings.expCategories }).from(userSettings).where(eq(userSettings.userId, ctx.userId));
  const cat = (x: string | Partial<ExpCategory>): ExpCategory => {
    const o = typeof x === "string" ? { name: x } : x;
    return { name: o.name!, color: o.color ?? null, sections: o.sections ?? defaultSections(o.name!) };
  };
  const list = (row?.list ?? DEFAULT_CATEGORIES).map(cat);
  for (const e of await expList(ctx)) for (const c of e.categories) if (!list.some((x) => x.name === c)) list.push(cat(c));
  return list;
}

const catName = z.string().trim().min(1, "이름을 입력해 주세요").max(20, "분류는 20자까지 쓸 수 있어요");
const catPatch = z.object({
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "색을 다시 골라 주세요").nullable().optional(),
  sections: z.array(z.enum(EXP_SECTIONS.map((x) => x.value) as ["content", "star", "cert"])).optional(),
});
async function saveCategories(ctx: Ctx, list: ExpCategory[]) {
  await db.insert(userSettings).values({ userId: ctx.userId, expCategories: list }).onConflictDoUpdate({ target: userSettings.userId, set: { expCategories: list, updatedAt: new Date() } });
}
// 경험에 붙은 분류를 한꺼번에 바꿈(버전을 올려 다른 기기의 오래된 수정은 충돌로 막힘). ponytail: 변경 기록(revision)은 안 남김
const retag = (ctx: Ctx, expr: ReturnType<typeof sql>, name: string) =>
  db
    .update(careerExperiences)
    .set({ categories: expr, version: sql`${careerExperiences.version} + 1`, updatedAt: new Date() })
    .where(and(eq(careerExperiences.userId, ctx.userId), sql`${careerExperiences.deletedAt} is null`, sql`${name} = any(${careerExperiences.categories})`));

export async function addExpCategory(ctx: Ctx, name: string) {
  const n = parse(catName, name);
  const list = await expCategories(ctx);
  if (list.some((x) => x.name === n)) throw new AppError("DUPLICATE", "이미 같은 이름의 분류가 있어요");
  await saveCategories(ctx, [...list, { name: n, color: null, sections: defaultSections(n) }]);
}
export async function renameExpCategory(ctx: Ctx, from: string, to: string) {
  const n = parse(catName, to);
  const list = await expCategories(ctx);
  if (n === from) return;
  if (list.some((x) => x.name === n)) throw new AppError("DUPLICATE", "이미 같은 이름의 분류가 있어요");
  await saveCategories(ctx, list.map((x) => (x.name === from ? { ...x, name: n } : x)));
  await retag(ctx, sql`array_replace(${careerExperiences.categories}, ${from}, ${n})`, from);
}
/** 지우면 그 분류가 붙은 경험에서도 빠짐(경험은 그대로) */
export async function removeExpCategory(ctx: Ctx, name: string) {
  await saveCategories(ctx, (await expCategories(ctx)).filter((x) => x.name !== name));
  await retag(ctx, sql`array_remove(${careerExperiences.categories}, ${name})`, name);
}
/** 순서 바꾸기: 받은 이름 순서대로, 빠진 이름은 원래 순서로 뒤에 */
export async function reorderExpCategories(ctx: Ctx, names: string[]) {
  const list = await expCategories(ctx);
  const rank = (n: string) => (names.includes(n) ? names.indexOf(n) : names.length + list.findIndex((x) => x.name === n));
  await saveCategories(ctx, [...list].sort((a, b) => rank(a.name) - rank(b.name)));
}
/** 색·보일 칸 바꾸기 */
export async function setExpCategory(ctx: Ctx, name: string, patch: unknown) {
  const v = parse(catPatch, patch);
  const list = await expCategories(ctx);
  if (!list.some((x) => x.name === name)) throw new AppError("NOT_FOUND", "찾을 수 없어요");
  const next = (x: ExpCategory): ExpCategory => ({
    ...x,
    ...(v.color !== undefined && { color: v.color?.toUpperCase() ?? null }),
    ...(v.sections && { sections: v.sections }),
  });
  await saveCategories(ctx, list.map((x) => (x.name === name ? next(x) : x)));
}

// ── 문서 ──

export const docInput = z.object({
  kind: z.enum(["resume", "cover_letter", "portfolio", "other"]),
  title: z.string().trim().min(1, "이름을 입력해 주세요").max(60, "이름은 60자까지 쓸 수 있어요"),
  memo: z.string().trim().max(1000).nullable().default(null),
});
export type DocInput = z.input<typeof docInput>;
export const createDoc = async (ctx: Ctx, input: unknown) => docRepo.create(ctx, parse(docInput, input));
export const updateDoc = async (ctx: Ctx, id: string, version: number, input: unknown) => docRepo.update(ctx, id, version, parse(docInput, input));

/** 문서 지우기: 버전들도 한 묶음으로 휴지통에(함께 복구) */
export async function removeDoc(ctx: Ctx, id: string) {
  await docRepo.get(ctx, id);
  const versions = await versionRepo.list(ctx, { where: eq(careerDocVersions.docId, id), limit: 1000 });
  const batchId = uuidv7();
  await db.transaction(async (tx) => {
    for (const v of versions) await versionRepo.remove(ctx, v.id, { tx, batchId });
    await docRepo.remove(ctx, id, { tx, batchId });
  });
}

const itemInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("link"), url, name: z.string().trim().max(60).nullable().default(null) }),
  z.object({ type: z.literal("file"), attachmentId: z.uuid() }),
]);
export const versionInput = z.object({
  label: z.string().trim().min(1, "버전 이름을 입력해 주세요").max(60, "버전 이름은 60자까지 쓸 수 있어요"),
  note: z.string().trim().max(1000).nullable().default(null),
  items: z.array(itemInput).max(10, "형식은 10개까지 넣을 수 있어요").default([]),
});
export type VersionInput = z.input<typeof versionInput>;

/** 버전 저장(새로 또는 고침). 파일은 이 버전에 붙이고, 빠진 파일은 휴지통으로 */
export async function saveVersion(ctx: Ctx, docId: string, id: string | null, version: number | null, input: unknown) {
  const v = parse(versionInput, input);
  await docRepo.get(ctx, docId);
  const fileIds = v.items.flatMap((i) => (i.type === "file" ? [i.attachmentId] : []));
  const files = fileIds.length
    ? await db
        .select({ id: attachments.id, fileName: attachments.fileName })
        .from(attachments)
        .where(and(eq(attachments.userId, ctx.userId), inArray(attachments.id, fileIds), eq(attachments.purpose, "career_file")))
    : [];
  const items = v.items.map((i) => {
    if (i.type === "link") return { id: uuidv7(), type: "link" as const, url: i.url, attachmentId: null, name: i.name || null };
    const f = files.find((x) => x.id === i.attachmentId);
    if (!f) throw new AppError("VALIDATION_FAILED", "파일을 다시 올려 주세요");
    return { id: uuidv7(), type: "file" as const, url: null, attachmentId: f.id, name: f.fileName };
  });
  return db.transaction(async (tx) => {
    const row = id ? await versionRepo.update(ctx, id, version ?? -1, { label: v.label, note: v.note || null, items }, { tx }) : await versionRepo.create(ctx, { docId, label: v.label, note: v.note || null, items }, { tx });
    await linkImages(tx, ctx, OWNER, row.id, fileIds);
    return row;
  });
}

/** 문서 종류별 목록 + 버전(최근 것부터) */
export async function docList(ctx: Ctx) {
  const [docs, versions] = await Promise.all([docRepo.list(ctx, { orderBy: [asc(careerDocs.kind), desc(careerDocs.updatedAt)], limit: 500 }), versionRepo.list(ctx, { orderBy: [desc(careerDocVersions.createdAt)], limit: 2000 })]);
  return docs.map((d) => ({
    id: d.id,
    version: d.version,
    kind: d.kind,
    title: d.title,
    memo: d.memo,
    versions: versions.filter((v) => v.docId === d.id).map((v) => ({ id: v.id, version: v.version, label: v.label, note: v.note, items: v.items, createdAt: v.createdAt.toISOString() })),
  }));
}
export type CareerDoc = Awaited<ReturnType<typeof docList>>[number];
