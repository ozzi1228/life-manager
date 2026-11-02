// 커리어 서비스: 경험 정리(앱 안에서 직접 쓰기) · 문서(이력서·자소서·포트폴리오) 버전별 링크·파일
// 버전의 파일은 attachments(owner_type=career_doc_version)로 붙임 → 버전을 지우면 휴지통, 영구 삭제 때 파일까지
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { uuidv7 } from "../db/id.ts";
import { attachments, careerDocs, careerDocVersions, careerExperiences } from "../db/schema.ts";
import { dateKey, normDate } from "../lib/career.ts";
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

/** 지금까지 쓴 분류(많이 쓴 순) — 고르기 목록 */
export async function expCategories(ctx: Ctx) {
  const count = new Map<string, number>();
  for (const e of await expList(ctx)) for (const c of e.categories) count.set(c, (count.get(c) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c);
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
