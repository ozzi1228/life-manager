// 건강 기록 서비스 (docs/planning/10 §4·5, 15 §10): 체중·혈당·주사. 값·메모는 암호화 저장, 읽을 때 풀어서 돌려줌
// 주사는 값 칸에 {약 이름, 용량, 부위} JSON을 암호화해 저장
// 민감 정보는 기본 숨김(10 §7): 홈 위젯·검색·AI·캘린더 어디에도 내보내지 않음 — 이 파일 밖에서 풀지 않음
// ponytail: 잠금(C-15)·목표 범위·직접 만든 지표는 아직
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { healthRecords } from "../db/schema.ts";
import { seal, unseal } from "../lib/ai/secret.ts";
import type { GlucoseContext, HealthKind, Injection } from "../lib/health.ts";
import { AppError } from "./errors.ts";
import { defineRepo, type Ctx } from "./repo.ts";
import { parse } from "./validate.ts";

export const healthRepo = defineRepo(healthRecords, "health_record");

export const healthInput = z
  .object({
    kind: z.enum(["weight", "glucose", "injection"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 다시 골라 주세요"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간을 다시 골라 주세요"),
    context: z.enum(["fasting", "before_meal", "after_1h", "after_2h", "bedtime", "other"]).nullable().default(null),
    value: z.number({ error: "값을 입력해 주세요" }).nullable().default(null),
    injection: z
      .object({
        name: z.string().trim().min(1, "약 이름을 입력해 주세요").max(40, "약 이름은 40자까지 쓸 수 있어요"),
        dose: z.string().trim().max(20, "용량은 20자까지 쓸 수 있어요").nullable().default(null),
        site: z.string().trim().max(20, "부위는 20자까지 쓸 수 있어요").nullable().default(null),
      })
      .nullable()
      .default(null),
    memo: z.string().trim().max(500, "메모는 500자까지 쓸 수 있어요").nullable().default(null),
  })
  .refine((v) => v.kind === "injection" || v.value !== null, { path: ["value"], message: "값을 입력해 주세요" })
  .refine((v) => v.kind !== "injection" || v.injection, { path: ["injection", "name"], message: "약 이름을 입력해 주세요" })
  .refine((v) => v.kind !== "weight" || (v.value! >= 20 && v.value! <= 300), { path: ["value"], message: "20~300 사이로 입력해 주세요" })
  .refine((v) => v.kind !== "glucose" || (Number.isInteger(v.value) && v.value! >= 20 && v.value! <= 600), { path: ["value"], message: "20~600 사이 정수로 입력해 주세요" })
  .refine((v) => v.kind !== "glucose" || v.context, { path: ["context"], message: "측정 시점을 골라 주세요" })
  .transform((v) => ({
    ...v,
    value: v.kind === "weight" ? Math.round(v.value! * 10) / 10 : v.value,
    context: v.kind === "glucose" ? v.context : null,
    injection: v.kind === "injection" && v.injection ? { name: v.injection.name, dose: v.injection.dose || null, site: v.injection.site || null } : null,
  }));
export type HealthInput = z.input<typeof healthInput>;

const toRow = (v: z.infer<typeof healthInput>) => ({
  kind: v.kind,
  date: v.date,
  time: v.time,
  context: v.context,
  valueEnc: seal(v.kind === "injection" ? JSON.stringify(v.injection) : String(v.value)),
  memoEnc: v.memo ? seal(v.memo) : null,
});

export async function createHealth(ctx: Ctx, input: unknown) {
  return healthRepo.create(ctx, toRow(parse(healthInput, input)));
}

export async function updateHealth(ctx: Ctx, id: string, version: number, input: unknown) {
  const v = parse(healthInput, input);
  const cur = await healthRepo.get(ctx, id);
  if (cur.kind !== v.kind) throw new AppError("VALIDATION_FAILED", "종류는 바꿀 수 없어요");
  return healthRepo.update(ctx, id, version, toRow(v));
}

/** 종류별 기록(최근 것부터), since 이후만. 값·메모를 풀어서 */
export async function healthList(ctx: Ctx, kind: HealthKind, since: string) {
  const rows = await healthRepo.list(ctx, { where: and(eq(healthRecords.kind, kind), gte(healthRecords.date, since)), orderBy: [desc(healthRecords.date), desc(healthRecords.time)], limit: 1000 });
  return rows.map((r) => {
    const plain = unseal(r.valueEnc);
    const injection = r.kind === "injection" ? (JSON.parse(plain) as Injection) : null;
    return { id: r.id, version: r.version, kind: r.kind, date: r.date, time: r.time, context: r.context as GlucoseContext | null, value: injection ? 0 : Number(plain), injection, memo: r.memoEnc ? unseal(r.memoEnc) : null };
  });
}
export type HealthRecord = Awaited<ReturnType<typeof healthList>>[number];
