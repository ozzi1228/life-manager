// 자산(계좌·카드·페이) 서비스 (docs/planning/06 §6·§7, D-071): 카드·페이·계좌. 혜택·실적 계산은 하지 않음(혜택은 메모에 직접)
// 셋 다 결제수단(payment_methods) + 1:1 설정 행(cards·pays·accounts). 설정은 처음 고칠 때 만듦 — 지출 입력에서 만든 것도 목록에 나옴
import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { uuidv7 } from "../db/id.ts";
import { db, type Tx } from "../db/index.ts";
import { accounts, cards, paymentMethods, pays, transactions } from "../db/schema.ts";
import { seal, unseal } from "../lib/ai/secret.ts";
import { CURRENCY_CODES, type Currency } from "../lib/format.ts";
import { AppError, notFound } from "./errors.ts";
import { createPaymentMethod, dup, paymentRepo, todayIn } from "./finance.ts";
import { recurringList } from "./recurring.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const cardRepo = defineRepo(cards, "card");
export const payRepo = defineRepo(pays, "pay");
export const accountRepo = defineRepo(accounts, "account");

type Kind = "card" | "pay" | "account";
const detail = { card: { repo: cardRepo, table: cards }, pay: { repo: payRepo, table: pays }, account: { repo: accountRepo, table: accounts } };
const name = (what: string) => z.string().trim().min(1, `${what} 이름을 입력해 주세요`).max(20, "이름은 20자까지 쓸 수 있어요");
const memo = z.string().trim().max(2000, "메모는 2000자까지 쓸 수 있어요").nullable().default(null);
const won = (max: number) => z.number().int().min(0).max(max).nullable().default(null);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null);

/** 숨기지 않은 결제수단(kind) + 설정 행(없으면 null) */
async function listOf<K extends Kind>(ctx: Ctx, kind: K) {
  const pms = await paymentRepo.list(ctx, { where: and(eq(paymentMethods.kind, kind), eq(paymentMethods.isHidden, false)), orderBy: [asc(paymentMethods.sort), asc(paymentMethods.createdAt)] });
  const { repo, table } = detail[kind];
  const rows = pms.length ? await (repo as typeof cardRepo).list(ctx, { where: inArray(table.paymentMethodId, pms.map((p) => p.id)) }) : [];
  return pms.map((pm) => ({ pm, row: (rows as (typeof detail)[K]["table"]["$inferSelect"][]).find((r) => r.paymentMethodId === pm.id) ?? null }));
}

/** 새로 만들기: 결제수단 + 설정 행 */
async function createOf(ctx: Ctx, kind: Kind, pmName: string, values: object) {
  const pm = await createPaymentMethod(ctx, { kind, name: pmName });
  await (detail[kind].repo as typeof cardRepo).create(ctx, { ...values, paymentMethodId: pm.id } as typeof cards.$inferInsert);
  return pm;
}

/** 고치기: 이름은 결제수단에, 나머지는 설정 행에(없으면 만듦) */
async function updateOf(ctx: Ctx, kind: Kind, pmId: string, pmVersion: number, pmName: string, values: object) {
  const pm = await paymentRepo.get(ctx, pmId);
  if (pm.kind !== kind) throw notFound();
  const { repo, table } = detail[kind];
  const r = repo as typeof cardRepo;
  return db.transaction(async (tx: Tx) => {
    if (pm.name !== pmName || pm.version !== pmVersion) await paymentRepo.update(ctx, pmId, pmVersion, { name: pmName }, { tx }).catch((e) => dup(e, "결제수단"));
    const [row] = await tx.select().from(table).where(and(eq(table.userId, ctx.userId), eq(table.paymentMethodId, pmId), isNull(table.deletedAt)));
    return row ? r.update(ctx, row.id, row.version, values, { tx }) : r.create(ctx, { ...values, paymentMethodId: pmId } as typeof cards.$inferInsert, { tx });
  });
}

/** 삭제: 결제수단 + 설정 행을 한 묶음으로 휴지통에(되돌리기·복구 가능). 지난 지출의 결제수단 이름은 그대로 보임(nameMaps) */
export async function removePaymentMethod(ctx: Ctx, kind: Kind, pmId: string) {
  const pm = await paymentRepo.get(ctx, pmId);
  if (pm.kind !== kind) throw new AppError("NOT_FOUND", "찾을 수 없어요");
  const { repo, table } = detail[kind];
  await db.transaction(async (tx: Tx) => {
    const batchId = uuidv7();
    await paymentRepo.remove(ctx, pmId, { batchId, tx });
    const [row] = await tx.select({ id: table.id }).from(table).where(and(eq(table.userId, ctx.userId), eq(table.paymentMethodId, pmId), isNull(table.deletedAt)));
    if (row) await (repo as typeof cardRepo).remove(ctx, row.id, { batchId, tx });
  });
}

/** 연결할 결제수단이 내 것이고 종류가 맞는지 */
async function checkKinds(ctx: Ctx, ids: string[], kinds: string[], message: string) {
  if (!ids.length) return;
  const rows = await paymentRepo.list(ctx, { where: inArray(paymentMethods.id, ids) });
  if (rows.length !== new Set(ids).size || rows.some((r) => !kinds.includes(r.kind))) throw new AppError("VALIDATION_FAILED", message);
}

// ── 카드 ──
// 카드번호·CVC·유효기간: 한 덩어리 JSON으로 암호화해 secret에(AI 키와 같은 AES-256-GCM). 목록엔 뒤 4자리만, 전체는 revealCard로만
const digits = (re: RegExp, message: string) => z.string().transform((s) => s.replace(/[\s-]/g, "")).pipe(z.string().regex(re, message).or(z.literal("")));
export const cardSecret = z.object({
  number: digits(/^\d{12,19}$/, "카드번호를 다시 확인해 주세요"),
  expiry: z.string().trim().regex(/^((0[1-9]|1[0-2])\/\d{2})?$/, "유효기간은 MM/YY로 입력해 주세요"),
  cvc: digits(/^\d{3,4}$/, "CVC는 숫자 3~4자리예요"),
});
export type CardSecret = z.infer<typeof cardSecret>;
export const cardInput = z.object({
  name: name("카드"),
  issuer: z.string().trim().max(20).nullable().default(null),
  cardType: z.enum(["credit", "check", "transit"]).nullable().default(null),
  billingDay: z.number().int().min(1).max(31).nullable().default(null),
  annualFee: won(1_000_000_000), // currency의 가장 작은 단위
  currency: z.enum(CURRENCY_CODES).default("KRW"),
  memo,
  linkedAccountId: z.uuid().nullable().default(null),
  secret: cardSecret.optional(), // 없으면 그대로 둠, 칸을 다 비우면 지움
});
export type CardInput = z.input<typeof cardInput>;

/** 저장할 값: secret이 오면 암호화(다 비었으면 지움), 안 오면 손대지 않음 */
function sealCard({ secret, ...rest }: z.infer<typeof cardInput>) {
  if (!secret) return rest;
  const empty = !secret.number && !secret.expiry && !secret.cvc;
  return { ...rest, last4: secret.number ? secret.number.slice(-4) : null, secret: empty ? null : seal(JSON.stringify(secret)) };
}

/** 카드번호·CVC·유효기간 풀어서 보기(카드 수정 창에서 누를 때만) */
export async function revealCard(ctx: Ctx, pmId: string): Promise<CardSecret | null> {
  const [row] = await db.select({ secret: cards.secret }).from(cards).where(and(eq(cards.userId, ctx.userId), eq(cards.paymentMethodId, pmId), isNull(cards.deletedAt)));
  return row?.secret ? JSON.parse(unseal(row.secret)) : null;
}

export async function cardList(ctx: Ctx) {
  return (await listOf(ctx, "card")).map(({ pm, row: c }) => ({
    id: pm.id,
    pmVersion: pm.version,
    name: pm.name,
    card: c ? { issuer: c.issuer, cardType: c.cardType, billingDay: c.billingDay, annualFee: c.annualFee, currency: c.currency as Currency, memo: c.memo, linkedAccountId: c.linkedAccountId, last4: c.last4, hasSecret: !!c.secret } : null,
  }));
}
export type CardItem = Awaited<ReturnType<typeof cardList>>[number];

export async function createCard(ctx: Ctx, input: unknown) {
  const { name, ...rest } = parse(cardInput, input);
  await checkKinds(ctx, rest.linkedAccountId ? [rest.linkedAccountId] : [], ["account"], "결제 계좌를 다시 골라 주세요");
  return createOf(ctx, "card", name, sealCard({ name, ...rest }));
}
export async function updateCard(ctx: Ctx, pmId: string, pmVersion: number, input: unknown) {
  const { name, ...rest } = parse(cardInput, input);
  await checkKinds(ctx, rest.linkedAccountId ? [rest.linkedAccountId] : [], ["account"], "결제 계좌를 다시 골라 주세요");
  return updateOf(ctx, "card", pmId, pmVersion, name, sealCard({ name, ...rest }));
}

// ── 페이 ──
export const payInput = z.object({ name: name("페이"), sourceIds: z.array(z.uuid()).max(30).default([]), memo });
export type PayInput = z.input<typeof payInput>;

export async function payList(ctx: Ctx) {
  return (await listOf(ctx, "pay")).map(({ pm, row }) => ({ id: pm.id, pmVersion: pm.version, name: pm.name, sourceIds: row?.sourceIds ?? [], memo: row?.memo ?? null }));
}
export type PayItem = Awaited<ReturnType<typeof payList>>[number];

export async function createPay(ctx: Ctx, input: unknown) {
  const { name, ...rest } = parse(payInput, input);
  await checkKinds(ctx, rest.sourceIds, ["card", "account"], "연결할 카드·계좌를 다시 골라 주세요");
  return createOf(ctx, "pay", name, rest);
}
export async function updatePay(ctx: Ctx, pmId: string, pmVersion: number, input: unknown) {
  const { name, ...rest } = parse(payInput, input);
  await checkKinds(ctx, rest.sourceIds, ["card", "account"], "연결할 카드·계좌를 다시 골라 주세요");
  return updateOf(ctx, "pay", pmId, pmVersion, name, rest);
}

// ── 계좌 ──
export const accountInput = z
  .object({
    name: name("계좌"),
    category: z.enum(["checking", "deposit", "savings", "stock"]).default("checking"),
    currency: z.enum(CURRENCY_CODES).default("KRW"), // 잔액·원금은 이 통화의 가장 작은 단위
    bank: z.string().trim().max(20).nullable().default(null),
    number: z.string().trim().max(40, "계좌번호는 40자까지 쓸 수 있어요").nullable().default(null),
    balance: won(100_000_000_000),
    principal: won(100_000_000_000),
    rate: z.number().min(0).max(100, "이율을 다시 확인해 주세요").nullable().default(null),
    tax: z.enum(["normal", "preferential", "free"]).nullable().default(null),
    startDate: ymd,
    maturityDate: ymd,
    memo,
  })
  .refine((v) => !v.startDate || !v.maturityDate || v.startDate < v.maturityDate, { message: "만기일은 시작일보다 뒤여야 해요", path: ["maturityDate"] })
  // 종류에 안 쓰는 칸은 비움(종류를 바꿔도 이전 값이 남지 않게)
  .transform((v) => {
    const saving = v.category === "deposit" || v.category === "savings";
    return { ...v, principal: v.category === "checking" ? null : v.principal, balance: saving ? null : v.balance, rate: saving ? v.rate : null, tax: saving ? (v.tax ?? "normal") : null, startDate: saving ? v.startDate : null, maturityDate: saving ? v.maturityDate : null };
  });
export type AccountInput = z.input<typeof accountInput>;

/** 계좌 목록 + 연결된 카드(이번 달 쓴 돈)와 자동 결제(이 계좌에서 바로, 또는 연결 카드로 나가는 고정 지출) */
export async function accountList(ctx: Ctx) {
  const [list, cardRows, recurring] = await Promise.all([listOf(ctx, "account"), listOf(ctx, "card"), recurringList(ctx)]);
  const linked = cardRows.filter((c) => c.row?.linkedAccountId);
  const month = todayIn().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const spent = linked.length
    ? await db
        .select({ id: transactions.paymentMethodId, sum: sql<number>`sum(case when ${transactions.isRefund} then -${transactions.amount} else ${transactions.amount} end)::bigint`.mapWith(Number) })
        .from(transactions)
        .where(and(eq(transactions.userId, ctx.userId), isNull(transactions.deletedAt), eq(transactions.type, "expense"), gte(transactions.date, `${month}-01`), lt(transactions.date, next), inArray(transactions.paymentMethodId, linked.map((c) => c.pm.id))))
        .groupBy(transactions.paymentMethodId)
    : [];
  const live = recurring.filter((r) => r.status !== "ended");
  return list.map(({ pm, row: a }) => {
    const myCards = linked.filter((c) => c.row!.linkedAccountId === pm.id).map((c) => ({ id: c.pm.id, name: c.pm.name, monthSpent: spent.find((s) => s.id === c.pm.id)?.sum ?? 0 }));
    const via = new Map(myCards.map((c) => [c.id, c.name]));
    return {
      id: pm.id,
      pmVersion: pm.version,
      name: pm.name,
      account: a && { category: a.category, currency: a.currency as Currency, bank: a.bank, number: a.number, balance: a.balance, principal: a.principal, rate: a.rate, tax: a.tax, startDate: a.startDate, maturityDate: a.maturityDate, memo: a.memo },
      cards: myCards,
      autopays: live
        .filter((r) => r.paymentMethodId === pm.id || via.has(r.paymentMethodId ?? ""))
        .map((r) => ({ id: r.id, name: r.name, amount: r.amount, variableAmount: r.variableAmount, label: r.label, next: r.next, via: via.get(r.paymentMethodId ?? "") ?? null })),
    };
  });
}
export type AccountItem = Awaited<ReturnType<typeof accountList>>[number];

export async function createAccount(ctx: Ctx, input: unknown) {
  const { name, ...rest } = parse(accountInput, input);
  return createOf(ctx, "account", name, rest);
}
export async function updateAccount(ctx: Ctx, pmId: string, pmVersion: number, input: unknown) {
  const { name, ...rest } = parse(accountInput, input);
  return updateOf(ctx, "account", pmId, pmVersion, name, rest);
}

/** 카드·계좌 고르기용 이름(페이 연결, 카드 결제 계좌). 예금·적금·주식 계좌는 빼고 입출금만 */
export async function sourceOptions(ctx: Ctx) {
  const [rows, notChecking] = await Promise.all([
    paymentRepo.list(ctx, { where: and(inArray(paymentMethods.kind, ["card", "account"]), eq(paymentMethods.isHidden, false)), orderBy: [asc(paymentMethods.sort), asc(paymentMethods.createdAt)] }),
    accountRepo.list(ctx, { where: ne(accounts.category, "checking") }),
  ]);
  const skip = new Set(notChecking.map((a) => a.paymentMethodId));
  return rows.filter((r) => !skip.has(r.id)).map((r) => ({ id: r.id, kind: r.kind as "card" | "account", name: r.name }));
}
