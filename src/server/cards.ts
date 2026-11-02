// 카드·혜택 서비스 (docs/planning/06 §6, 04 §6.8~6.10, 15 §6 /cards). 계산은 src/lib/cards.ts
// 카드 = 결제수단(kind=card). 카드 설정(cards 행)은 처음 고칠 때 만듦 — 지출 입력에서 만든 카드도 목록에 나옴
// 실적 기준 기간은 "달력 한 달"만(Q-036 미결정: 결제일 기준은 정해지면)
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/index.ts";
import { cardBenefits, cards, paymentMethods } from "../db/schema.ts";
import { benefitUsage, INDUSTRIES, performance, perfTarget, type Benefit, type CardTx } from "../lib/cards.ts";
import { AppError, notFound } from "./errors.ts";
import { createPaymentMethod, dup, monthTransactions, paymentRepo } from "./finance.ts";
import { prevMonth } from "./budget.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { todayIn } from "./time.ts";
import { parse } from "./validate.ts";

export const cardRepo = defineRepo(cards, "card");
export const benefitRepo = defineRepo(cardBenefits, "card_benefit");

const won = z.number().int().min(1).max(10_000_000_000);
export const cardInput = z.object({
  name: z.string().trim().min(1, "카드 이름을 입력해 주세요").max(20, "이름은 20자까지 쓸 수 있어요"),
  issuer: z.string().trim().max(20).nullable().default(null),
  cardType: z.enum(["credit", "check"]).nullable().default(null),
  billingDay: z.number().int().min(1).max(31).nullable().default(null),
  perfExcludes: z.object({ categoryIds: z.array(z.uuid()).max(50), industries: z.array(z.enum(INDUSTRIES)).max(20) }).default({ categoryIds: [], industries: [] }),
  annualFee: z.number().int().min(0).max(10_000_000).nullable().default(null),
  memo: z.string().trim().max(1000).nullable().default(null),
});
export type CardInput = z.input<typeof cardInput>;

export const benefitInput = z
  .object({
    targetType: z.enum(["merchant", "industry"]),
    targets: z.array(z.string().trim().min(1).max(30)).min(1, "대상을 골라 주세요").max(30),
    benefitType: z.enum(["discount", "point", "cashback"]),
    valueType: z.enum(["percent", "amount"]),
    value: z.number({ error: "혜택 크기를 입력해 주세요" }).positive("혜택 크기를 입력해 주세요").max(10_000_000),
    perTxnMax: won.nullable().default(null),
    minAmount: won.nullable().default(null),
    limitType: z.enum(["amount", "count", "none"]).default("none"),
    monthlyLimit: won.nullable().default(null),
    tiers: z.array(z.object({ minPrevPerf: won, value: z.number().positive().max(10_000_000).nullable().default(null), limit: won.nullable().default(null) })).max(10).default([]),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullable().default(null),
    timeFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
    timeTo: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
    excludeInstallment: z.boolean().default(false),
    excludeOnline: z.boolean().default(false),
    excludeNote: z.string().trim().max(200).nullable().default(null),
    memo: z.string().trim().max(1000).nullable().default(null),
  })
  .refine((v) => v.valueType !== "percent" || v.value <= 100, { path: ["value"], message: "100% 이하로 입력해 주세요" })
  .refine((v) => v.limitType === "none" || v.monthlyLimit, { path: ["monthlyLimit"], message: "월 한도를 입력해 주세요" })
  .refine((v) => v.targetType !== "industry" || v.targets.every((t) => (INDUSTRIES as readonly string[]).includes(t)), { path: ["targets"], message: "업종을 다시 골라 주세요" })
  .transform((v) => ({ ...v, monthlyLimit: v.limitType === "none" ? null : v.monthlyLimit, daysOfWeek: v.daysOfWeek?.length ? v.daysOfWeek : null, tiers: [...v.tiers].sort((a, b) => a.minPrevPerf - b.minPrevPerf) }));
export type BenefitInput = z.input<typeof benefitInput>;

const toCardTx = (t: Awaited<ReturnType<typeof monthTransactions>>[number]): CardTx => ({ id: t.id, amount: t.amount, isRefund: t.isRefund, date: t.date, categoryId: t.categoryId, title: t.title });

async function cardPms(ctx: Ctx, ids?: string[]) {
  return paymentRepo.list(ctx, { where: and(eq(paymentMethods.kind, "card"), eq(paymentMethods.isHidden, false), ids ? inArray(paymentMethods.id, ids) : undefined), orderBy: [asc(paymentMethods.sort), asc(paymentMethods.createdAt)] });
}

/** 카드들의 이번 달 실적·전월 실적·혜택 사용(예상) */
async function compute(ctx: Ctx, pms: Awaited<ReturnType<typeof cardPms>>) {
  const month = todayIn().slice(0, 7);
  const ids = pms.map((p) => p.id);
  const [rows, benefits, now, prev] = await Promise.all([
    ids.length ? cardRepo.list(ctx, { where: inArray(cards.paymentMethodId, ids) }) : [],
    benefitRepo.list(ctx, { orderBy: [asc(cardBenefits.createdAt)], limit: 1000 }),
    monthTransactions(ctx, month, "expense"),
    monthTransactions(ctx, prevMonth(month), "expense"),
  ]);
  const cards_ = pms.map((pm) => {
    const card = rows.find((r) => r.paymentMethodId === pm.id) ?? null;
    const ex = card?.perfExcludes ?? { categoryIds: [], industries: [] };
    const mine = now.filter((t) => t.paymentMethodId === pm.id).map(toCardTx);
    const prevPerf = performance(prev.filter((t) => t.paymentMethodId === pm.id).map(toCardTx), ex);
    const bs = card ? benefits.filter((b) => b.cardId === card.id) : [];
    const withUse = bs.map((b) => ({ ...b, usage: benefitUsage(b as Benefit, mine, prevPerf) }));
    const limited = withUse.filter((b) => b.limitType === "amount" && b.usage.applies && b.usage.limit);
    return {
      id: pm.id,
      pmVersion: pm.version,
      name: pm.name,
      card,
      perf: performance(mine, ex),
      prevPerf,
      target: perfTarget(bs as Benefit[]),
      limitUsed: limited.reduce((a, b) => a + b.usage.used, 0),
      limitTotal: limited.reduce((a, b) => a + (b.usage.limit ?? 0), 0),
      benefits: withUse,
      txs: mine,
    };
  });
  return { cards: cards_, noPayment: now.filter((t) => !t.paymentMethodId).length };
}

/** 카드 목록(SCR-FIN-08) */
export async function cardList(ctx: Ctx) {
  const { cards: list, noPayment } = await compute(ctx, await cardPms(ctx));
  return { cards: list.map((c) => ({ ...c, txs: undefined })), noPayment };
}

/** 카드 상세(SCR-FIN-09): 혜택별 사용, 이번 달 혜택 받은 지출 */
export async function cardDetail(ctx: Ctx, pmId: string) {
  const pms = await cardPms(ctx, [pmId]);
  if (!pms.length) throw notFound();
  const { cards: [c] } = await compute(ctx, pms);
  return c;
}

async function rowFor(ctx: Ctx, pmId: string, tx?: Tx) {
  const [row] = await (tx ?? db).select().from(cards).where(and(eq(cards.userId, ctx.userId), eq(cards.paymentMethodId, pmId)));
  return row && !row.deletedAt ? row : null;
}

/** 새 카드: 결제수단(카드) + 카드 설정 */
export async function createCard(ctx: Ctx, input: unknown) {
  const v = parse(cardInput, input);
  const pm = await createPaymentMethod(ctx, { kind: "card", name: v.name });
  const { issuer, cardType, billingDay, perfExcludes, annualFee, memo } = v;
  await cardRepo.create(ctx, { issuer, cardType, billingDay, perfExcludes, annualFee, memo, paymentMethodId: pm.id });
  return pm;
}

/** 카드 고치기: 이름은 결제수단에, 나머지는 카드 설정에(없으면 만듦) */
export async function updateCard(ctx: Ctx, pmId: string, pmVersion: number, input: unknown) {
  const v = parse(cardInput, input);
  const pm = await paymentRepo.get(ctx, pmId);
  if (pm.kind !== "card") throw notFound();
  const { name, ...rest } = v;
  return db.transaction(async (tx) => {
    if (pm.name !== name || pm.version !== pmVersion) await paymentRepo.update(ctx, pmId, pmVersion, { name }, { tx }).catch((e) => dup(e, "결제수단"));
    const row = await rowFor(ctx, pmId, tx);
    return row ? cardRepo.update(ctx, row.id, row.version, rest, { tx }) : cardRepo.create(ctx, { ...rest, paymentMethodId: pmId }, { tx });
  });
}

/** 카드 설정 행(혜택을 붙이려면 필요) */
async function ensureCard(ctx: Ctx, pmId: string, tx: Tx) {
  const pm = await paymentRepo.get(ctx, pmId);
  if (pm.kind !== "card") throw notFound();
  return (await rowFor(ctx, pmId, tx)) ?? cardRepo.create(ctx, { paymentMethodId: pmId }, { tx });
}
/** 혜택을 넣거나 고치면 "최종 확인일"을 오늘로(06 §6.2) */
const touch = (ctx: Ctx, card: { id: string; version: number }, tx: Tx) => cardRepo.update(ctx, card.id, card.version, { verifiedAt: todayIn() }, { tx });

export async function addBenefit(ctx: Ctx, pmId: string, input: unknown) {
  const v = parse(benefitInput, input);
  return db.transaction(async (tx) => {
    const card = await ensureCard(ctx, pmId, tx);
    await touch(ctx, card, tx);
    return benefitRepo.create(ctx, { ...v, cardId: card.id }, { tx });
  });
}

export async function updateBenefit(ctx: Ctx, id: string, version: number, input: unknown) {
  const v = parse(benefitInput, input);
  const b = await benefitRepo.get(ctx, id);
  return db.transaction(async (tx) => {
    const [card] = await tx.select().from(cards).where(and(eq(cards.userId, ctx.userId), eq(cards.id, b.cardId)));
    if (card) await touch(ctx, card, tx);
    return benefitRepo.update(ctx, id, version, v, { tx });
  });
}

/** 카드 숨기기: 지난 지출의 결제수단 이름은 그대로(06 §10, 지우기보다 숨김) */
export async function hideCard(ctx: Ctx, pmId: string, version: number) {
  const pm = await paymentRepo.get(ctx, pmId);
  if (pm.kind !== "card") throw new AppError("NOT_FOUND", "찾을 수 없어요");
  return paymentRepo.update(ctx, pmId, version, { isHidden: true });
}
