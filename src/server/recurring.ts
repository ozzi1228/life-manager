// 고정 지출 서비스 (docs/planning/06 §5, 04 §6.6·6.7, 15 §6)
// 상태: 이용 중 / 해지 예정(마지막 이용일까지 결제분만) / 해지됨. 마지막 이용일이 지나면 읽을 때 해지됨으로 봄
// ponytail: 자동 기록·결제일 알림은 예약 작업(M-21)과 함께. 지금은 저장만(notify·autoRecord)
import { z } from "zod";
import { recurringPayments } from "../db/schema.ts";
import { addDays, datesBetween, nextDate, perMonth, ruleLabel, type Rule } from "../lib/recurring.ts";
import { AppError } from "./errors.ts";
import { categoryRepo, paymentRepo } from "./finance.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { todayIn } from "./time.ts";
import { parse } from "./validate.ts";

export const recurringRepo = defineRepo(recurringPayments, "recurring_payment");
type Row = typeof recurringPayments.$inferSelect;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 선택해 주세요");
const dayOfMonth = z.number().int().min(0).max(31);
export const recurringInput = z
  .object({
    name: z.string().trim().min(1, "이름을 입력해 주세요").max(40, "이름은 40자까지 쓸 수 있어요"),
    amount: z.number({ error: "금액을 입력해 주세요" }).int().min(1, "1원 이상 입력해 주세요").max(10_000_000_000),
    variableAmount: z.boolean().default(false),
    cycle: z.enum(["monthly", "yearly", "every_n_months", "weekly"]),
    dayOfMonth: dayOfMonth.nullable().default(null),
    monthOfYear: z.number().int().min(1).max(12).nullable().default(null),
    intervalMonths: z.number().int().min(2).max(12).nullable().default(null),
    anchorMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null),
    weekday: z.number().int().min(0).max(6).nullable().default(null),
    paymentMethodId: z.uuid().nullable().default(null),
    categoryId: z.uuid().nullable().default(null),
    memo: z.string().trim().max(1000).nullable().default(null),
    startedAt: ymd.optional(),
    notify: z.boolean().default(true),
  })
  // 주기마다 필요한 값만 남기고, 빠진 값이 있으면 거절
  .transform((v, ctx) => {
    const need = { monthly: ["dayOfMonth"], yearly: ["monthOfYear", "dayOfMonth"], every_n_months: ["intervalMonths", "anchorMonth", "dayOfMonth"], weekly: ["weekday"] }[v.cycle];
    for (const k of need) if (v[k as keyof typeof v] === null) ctx.addIssue({ code: "custom", path: [k], message: "결제일을 골라 주세요" });
    const keep = (k: string) => (need.includes(k) ? v[k as keyof typeof v] : null);
    return {
      ...v,
      dayOfMonth: keep("dayOfMonth") as number | null,
      monthOfYear: keep("monthOfYear") as number | null,
      intervalMonths: keep("intervalMonths") as number | null,
      anchorMonth: keep("anchorMonth") as string | null,
      weekday: keep("weekday") as number | null,
      memo: v.memo || null,
    };
  });

export const ruleOf = (r: Pick<Row, "cycle" | "dayOfMonth" | "monthOfYear" | "intervalMonths" | "anchorMonth" | "weekday">): Rule =>
  r.cycle === "monthly"
    ? { cycle: "monthly", dayOfMonth: r.dayOfMonth! }
    : r.cycle === "yearly"
      ? { cycle: "yearly", monthOfYear: r.monthOfYear!, dayOfMonth: r.dayOfMonth! }
      : r.cycle === "every_n_months"
        ? { cycle: "every_n_months", intervalMonths: r.intervalMonths!, anchorMonth: r.anchorMonth!, dayOfMonth: r.dayOfMonth! }
        : { cycle: "weekly", weekday: r.weekday! };

/** 오늘 기준 실제 상태(해지 예정인데 마지막 이용일이 지났으면 해지됨) */
export const statusOf = (r: Row, today: string) => (r.status === "ending" && r.lastUseDate! < today ? "ended" : r.status);

/** 다음 결제일: 시작일 전·마지막 이용일 뒤는 없음 */
export function nextPay(r: Row, today: string) {
  if (statusOf(r, today) === "ended") return null;
  const d = nextDate(ruleOf(r), r.startedAt > today ? r.startedAt : today);
  return r.status === "ending" && d > r.lastUseDate! ? null : d;
}

/** 기간 안 결제일들(예산·결제 예정, 06 §5.3: 해지 예정은 마지막 이용일까지만) */
export function paysBetween(r: Row, from: string, to: string) {
  if (r.status === "ended") return [];
  const end = r.status === "ending" && r.lastUseDate! < to ? r.lastUseDate! : to;
  const start = r.startedAt > from ? r.startedAt : from;
  return start > end ? [] : datesBetween(ruleOf(r), start, end);
}

async function checkRefs(ctx: Ctx, v: { paymentMethodId: string | null; categoryId: string | null }) {
  if (v.paymentMethodId && !(await paymentRepo.get(ctx, v.paymentMethodId).catch(() => null))) throw new AppError("VALIDATION_FAILED", "결제수단을 다시 골라 주세요");
  if (v.categoryId) {
    const c = await categoryRepo.get(ctx, v.categoryId).catch(() => null);
    if (!c || c.kind !== "expense") throw new AppError("VALIDATION_FAILED", "분류를 다시 골라 주세요");
  }
}

export async function createRecurring(ctx: Ctx, input: unknown) {
  const v = parse(recurringInput, input);
  await checkRefs(ctx, v);
  return recurringRepo.create(ctx, { ...v, startedAt: v.startedAt ?? todayIn() });
}

export async function updateRecurring(ctx: Ctx, id: string, version: number, input: unknown) {
  const v = parse(recurringInput, input);
  await checkRefs(ctx, v);
  const { startedAt, ...rest } = v;
  return recurringRepo.update(ctx, id, version, startedAt ? { ...rest, startedAt } : rest);
}

/** 해지 예정: 마지막 이용일(오늘 이후)까지 이용 */
export async function scheduleEnd(ctx: Ctx, id: string, version: number, lastUseDate: string) {
  parse(ymd, lastUseDate);
  if (lastUseDate < todayIn()) throw new AppError("VALIDATION_FAILED", "오늘이나 그 뒤 날짜를 골라 주세요");
  return recurringRepo.update(ctx, id, version, { status: "ending", lastUseDate, endedAt: null });
}

export const cancelEnd = (ctx: Ctx, id: string, version: number) => recurringRepo.update(ctx, id, version, { status: "active", lastUseDate: null, endedAt: null });
export const endNow = (ctx: Ctx, id: string, version: number) => recurringRepo.update(ctx, id, version, { status: "ended", endedAt: todayIn(), lastUseDate: null });
export const reactivate = cancelEnd;

/** 목록 화면: 상태·다음 결제일·월 환산 */
export async function recurringList(ctx: Ctx) {
  const today = todayIn();
  const rows = await recurringRepo.list(ctx, { limit: 500 });
  return rows
    .map((r) => {
      const status = statusOf(r, today);
      return {
        id: r.id,
        version: r.version,
        name: r.name,
        amount: r.amount,
        variableAmount: r.variableAmount,
        cycle: r.cycle,
        dayOfMonth: r.dayOfMonth,
        monthOfYear: r.monthOfYear,
        intervalMonths: r.intervalMonths,
        anchorMonth: r.anchorMonth,
        weekday: r.weekday,
        paymentMethodId: r.paymentMethodId,
        categoryId: r.categoryId,
        memo: r.memo,
        notify: r.notify,
        startedAt: r.startedAt,
        status,
        lastUseDate: r.lastUseDate,
        endedAt: status === "ended" ? (r.endedAt ?? r.lastUseDate) : null,
        label: ruleLabel(ruleOf(r)),
        next: nextPay(r, today),
        perMonth: status === "ended" ? 0 : perMonth(r.amount, ruleOf(r)),
      };
    })
    .sort((a, b) => (a.next ?? "9999").localeCompare(b.next ?? "9999") || a.name.localeCompare(b.name));
}

/** 오늘부터 n일 안 결제 예정(한눈에, 06 §5) */
export async function upcoming(ctx: Ctx, days = 7) {
  const today = todayIn();
  const to = addDays(today, days - 1);
  const rows = await recurringRepo.list(ctx, { limit: 500 });
  return rows
    .flatMap((r) => paysBetween(r, today, to).map((date) => ({ id: r.id, name: r.name, amount: r.amount, variableAmount: r.variableAmount, date, memo: r.memo, ending: r.status === "ending" ? r.lastUseDate : null })))
    .sort((a, b) => a.date.localeCompare(b.date));
}
