// 카드 서비스 (docs/planning/06 §6, D-071): 내 결제수단 카드 목록 + 메모. 혜택·실적 계산은 하지 않음(혜택은 메모에 직접)
// 카드 = 결제수단(kind=card). 카드 설정(cards 행)은 처음 고칠 때 만듦 — 지출 입력에서 만든 카드도 목록에 나옴
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { cards, paymentMethods } from "../db/schema.ts";
import { AppError, notFound } from "./errors.ts";
import { createPaymentMethod, dup, paymentRepo } from "./finance.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const cardRepo = defineRepo(cards, "card");

export const cardInput = z.object({
  name: z.string().trim().min(1, "카드 이름을 입력해 주세요").max(20, "이름은 20자까지 쓸 수 있어요"),
  issuer: z.string().trim().max(20).nullable().default(null),
  cardType: z.enum(["credit", "check"]).nullable().default(null),
  billingDay: z.number().int().min(1).max(31).nullable().default(null),
  annualFee: z.number().int().min(0).max(10_000_000).nullable().default(null),
  memo: z.string().trim().max(2000, "메모는 2000자까지 쓸 수 있어요").nullable().default(null),
});
export type CardInput = z.input<typeof cardInput>;

/** 카드 목록: 숨기지 않은 카드 결제수단 + 카드 설정(없으면 null) */
export async function cardList(ctx: Ctx) {
  const pms = await paymentRepo.list(ctx, { where: and(eq(paymentMethods.kind, "card"), eq(paymentMethods.isHidden, false)), orderBy: [asc(paymentMethods.sort), asc(paymentMethods.createdAt)] });
  const rows = pms.length ? await cardRepo.list(ctx, { where: inArray(cards.paymentMethodId, pms.map((p) => p.id)) }) : [];
  return pms.map((pm) => {
    const c = rows.find((r) => r.paymentMethodId === pm.id);
    return { id: pm.id, pmVersion: pm.version, name: pm.name, card: c ? { issuer: c.issuer, cardType: c.cardType, billingDay: c.billingDay, annualFee: c.annualFee, memo: c.memo } : null };
  });
}
export type CardItem = Awaited<ReturnType<typeof cardList>>[number];

/** 새 카드: 결제수단(카드) + 카드 설정 */
export async function createCard(ctx: Ctx, input: unknown) {
  const { name, ...rest } = parse(cardInput, input);
  const pm = await createPaymentMethod(ctx, { kind: "card", name });
  await cardRepo.create(ctx, { ...rest, paymentMethodId: pm.id });
  return pm;
}

/** 카드 고치기: 이름은 결제수단에, 나머지는 카드 설정에(없으면 만듦) */
export async function updateCard(ctx: Ctx, pmId: string, pmVersion: number, input: unknown) {
  const { name, ...rest } = parse(cardInput, input);
  const pm = await paymentRepo.get(ctx, pmId);
  if (pm.kind !== "card") throw notFound();
  return db.transaction(async (tx) => {
    if (pm.name !== name || pm.version !== pmVersion) await paymentRepo.update(ctx, pmId, pmVersion, { name }, { tx }).catch((e) => dup(e, "결제수단"));
    const [row] = await tx.select().from(cards).where(and(eq(cards.userId, ctx.userId), eq(cards.paymentMethodId, pmId)));
    return row && !row.deletedAt ? cardRepo.update(ctx, row.id, row.version, rest, { tx }) : cardRepo.create(ctx, { ...rest, paymentMethodId: pmId }, { tx });
  });
}

/** 카드 숨기기: 지난 지출의 결제수단 이름은 그대로(06 §10, 지우기보다 숨김) */
export async function hideCard(ctx: Ctx, pmId: string, version: number) {
  const pm = await paymentRepo.get(ctx, pmId);
  if (pm.kind !== "card") throw new AppError("NOT_FOUND", "찾을 수 없어요");
  return paymentRepo.update(ctx, pmId, version, { isHidden: true });
}
