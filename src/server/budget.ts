// 월별 예산 서비스 (docs/planning/06 §4, 04 §6.4·6.5, 15 §6 /budgets/:month). 계산은 src/lib/budget.ts
// - 이번 달에 예산이 없고 지난달 예산이 "다음 달에도 같은 예산 쓰기"면 분류별 예산을 자동 복사(큰 지출은 복사 안 함)
// - 고정 지출 합계 = 그 달 결제일이 있는 이용 중·해지 예정(마지막 이용일까지) 고정 지출 금액 합
// ponytail: 해지됨으로 바뀐 고정 지출은 지난 달 합계에서도 빠짐(상태 이력이 없음). 지난 달 정확도가 필요해지면 결제 회차 기록(C-13)으로
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { budgets, plannedExpenses } from "../db/schema.ts";
import { fromActual, summarize } from "../lib/budget.ts";
import { addDays } from "../lib/recurring.ts";
import { AppError } from "./errors.ts";
import { CURRENCY_CODES, type Currency } from "../lib/format.ts";
import { categoryRepo, cleanForeign, foreignFields, monthTransactions, plannedRepo } from "./finance.ts";
import { paysBetween, recurringRepo } from "./recurring.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { todayIn } from "./time.ts";
import { parse } from "./validate.ts";

export const budgetRepo = defineRepo(budgets, "budget");

const monthRe = /^\d{4}-\d{2}$/;
const checkMonth = (m: string) => {
  if (!monthRe.test(m)) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요");
};
export const prevMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};
export const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
export const monthEnd = (m: string) => addDays(`${nextMonth(m)}-01`, -1);

const amount = z.number().int().min(1, "1원 이상 입력해 주세요").max(10_000_000_000, "100억 원까지 입력할 수 있어요");
export const budgetInput = z
  .object({
    lines: z.record(z.uuid(), amount).default({}), // 원
    // 다른 통화로 정한 분류 예산의 원래 금액(lines에는 원화 환산액)
    foreignLines: z.record(z.uuid(), z.object({ currency: z.enum(CURRENCY_CODES), amount: foreignFields.foreignAmount.unwrap().unwrap() })).default({}),
    planned: z.array(z.object({ id: z.uuid().optional(), name: z.string().trim().min(1, "큰 지출 이름을 입력해 주세요").max(30, "이름은 30자까지 쓸 수 있어요"), amount, ...foreignFields })).max(30).default([]),
    copyNext: z.boolean().default(true),
  })
  .transform((v) => ({ ...v, foreignLines: Object.fromEntries(Object.entries(v.foreignLines).filter(([id, f]) => id in v.lines && f.currency !== "KRW")), planned: v.planned.map(cleanForeign) }));
export type BudgetInput = z.input<typeof budgetInput>;

const findBudget = async (ctx: Ctx, month: string) => (await budgetRepo.list(ctx, { where: eq(budgets.month, month), limit: 1 }))[0] ?? null;
const plannedOf = (ctx: Ctx, month: string) => plannedRepo.list(ctx, { where: eq(plannedExpenses.month, month), orderBy: [asc(plannedExpenses.createdAt)] });

/** 그 달 고정 지출: 결제일마다 금액(고정 수입은 빼고) */
async function fixedOf(ctx: Ctx, month: string) {
  const rows = (await recurringRepo.list(ctx, { limit: 500 })).filter((r) => r.type === "expense");
  const from = `${month}-01`;
  const to = monthEnd(month);
  return rows.flatMap((r) => paysBetween(r, from, to).map((date) => ({ id: r.id, name: r.name, amount: r.amount, date }))).sort((a, b) => a.date.localeCompare(b.date));
}

/** 이번 달에 처음 들어왔고 지난달이 "다음 달에도 같은 예산"이면 분류별 예산 복사 */
async function autoCopy(ctx: Ctx, month: string) {
  if (month !== todayIn().slice(0, 7)) return null;
  const prev = await findBudget(ctx, prevMonth(month));
  if (!prev?.copyNext || !Object.keys(prev.lines).length) return null;
  // 동시에 두 번 들어와도 한 번만(부분 고유 인덱스) — 실패하면 먼저 만든 것을 읽음
  return budgetRepo.create(ctx, { month, lines: prev.lines, foreignLines: prev.foreignLines, copyNext: true }, { source: "copy" }).catch(() => findBudget(ctx, month));
}

/** 예산 화면·한눈에: 저장된 예산 + 계산 결과 + 빠른 채우기 재료 */
export async function budgetView(ctx: Ctx, month: string) {
  checkMonth(month);
  const budget = (await findBudget(ctx, month)) ?? (await autoCopy(ctx, month));
  const [planned, fixed, txs, prev] = await Promise.all([plannedOf(ctx, month), fixedOf(ctx, month), monthTransactions(ctx, month, "expense"), findBudget(ctx, prevMonth(month))]);
  const today = todayIn();
  const summary = summarize({ lines: budget?.lines ?? {}, planned, fixed: fixed.reduce((a, f) => a + f.amount, 0), txs, today });
  return {
    month,
    budget: budget && { id: budget.id, version: budget.version, lines: budget.lines, foreignLines: budget.foreignLines as Record<string, { currency: Currency; amount: number }>, copyNext: budget.copyNext, copied: budget.source === "copy" },
    planned: planned.map((p) => ({ id: p.id, version: p.version, name: p.name, amount: p.amount, currency: p.currency as Currency, foreignAmount: p.foreignAmount, manuallyDone: p.manuallyDone })),
    fixed,
    summary,
    txs: txs.filter((t) => t.date <= today).map((t) => ({ id: t.id, title: t.title, amount: t.isRefund ? -t.amount : t.amount, date: t.date, categoryId: t.categoryId, plannedExpenseId: t.plannedExpenseId, restraint: t.restraint })),
    prevLines: prev && Object.keys(prev.lines).length ? prev.lines : null,
  };
}

/** 지난달 실제 지출(분류별, 큰 지출 연결 제외) → 빠른 채우기용 */
export async function lastMonthActual(ctx: Ctx, month: string) {
  const p = prevMonth(month);
  const [planned, txs] = await Promise.all([plannedOf(ctx, p), monthTransactions(ctx, p, "expense")]);
  const s = summarize({ lines: {}, planned, fixed: 0, txs, today: monthEnd(p) });
  return fromActual(s.noBudget);
}

/** 예산 전체 저장(15 §6 PUT /budgets/:month). 처음이면 version 없이 */
export async function saveBudget(ctx: Ctx, month: string, version: number | null, input: unknown) {
  checkMonth(month);
  const v = parse(budgetInput, input);
  for (const id of Object.keys(v.lines)) {
    const c = await categoryRepo.get(ctx, id).catch(() => null);
    if (!c || c.kind !== "expense") throw new AppError("VALIDATION_FAILED", "분류를 다시 골라 주세요");
  }
  return db.transaction(async (tx) => {
    const row =
      version === null
        ? await budgetRepo.create(ctx, { month, lines: v.lines, foreignLines: v.foreignLines, copyNext: v.copyNext }, { tx }).catch(() => {
            throw new AppError("VERSION_CONFLICT", "다른 기기에서 먼저 저장했어요. 닫고 다시 열어 주세요");
          })
        : await budgetRepo.update(ctx, (await findBudget(ctx, month))?.id ?? "", version, { lines: v.lines, foreignLines: v.foreignLines, copyNext: v.copyNext }, { tx });
    // 큰 지출: 있는 것은 고치고, 새것은 만들고, 빠진 것은 휴지통으로(연결된 지출은 분류 사용으로 돌아감)
    const current = await plannedOf(ctx, month);
    const keep = new Set(v.planned.flatMap((p) => (p.id ? [p.id] : [])));
    for (const p of current) if (!keep.has(p.id)) await plannedRepo.remove(ctx, p.id, { tx });
    for (const p of v.planned) {
      const old = p.id && current.find((c) => c.id === p.id);
      if (old) {
        const next = { name: p.name, amount: p.amount, currency: p.currency, foreignAmount: p.foreignAmount };
        if (Object.entries(next).some(([k, x]) => old[k as keyof typeof next] !== x)) await plannedRepo.update(ctx, old.id, old.version, next, { tx });
      } else await plannedRepo.create(ctx, { month, name: p.name, amount: p.amount, currency: p.currency, foreignAmount: p.foreignAmount }, { tx });
    }
    return row;
  });
}

/** 지난달 분류별 예산 그대로 이번 달에(큰 지출은 복사 안 함) */
export async function copyPrevious(ctx: Ctx, month: string) {
  checkMonth(month);
  const prev = await findBudget(ctx, prevMonth(month));
  if (!prev) throw new AppError("NOT_FOUND", "지난달 예산이 없어요");
  if (await findBudget(ctx, month)) throw new AppError("VERSION_CONFLICT", "이번 달 예산이 이미 있어요");
  return budgetRepo.create(ctx, { month, lines: prev.lines, foreignLines: prev.foreignLines, copyNext: prev.copyNext }, { source: "copy" });
}

/** 큰 지출 "다 썼어요" 직접 표시 */
export const setPlannedDone = (ctx: Ctx, id: string, version: number, done: boolean) => plannedRepo.update(ctx, id, version, { manuallyDone: done });

/** 이 지출로 분류 예산을 넘었는지(지출 저장 직후, 04 §6.3 토스트) */
export async function budgetEffect(ctx: Ctx, t: { categoryId: string; date: string; amount: number; isRefund: boolean; plannedExpenseId: string | null }) {
  if (t.isRefund || t.plannedExpenseId || t.date > todayIn()) return null;
  const month = t.date.slice(0, 7);
  const budget = await findBudget(ctx, month);
  const line = budget?.lines[t.categoryId];
  if (line === undefined) return null;
  const { summary } = await budgetView(ctx, month);
  const used = summary.categories.find((c) => c.categoryId === t.categoryId)?.used ?? 0;
  if (used <= line || used - t.amount > line) return null; // 이번 저장으로 처음 넘은 경우만
  const cat = await categoryRepo.get(ctx, t.categoryId);
  return { category: cat.name, over: used - line };
}

