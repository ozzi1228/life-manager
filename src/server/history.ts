// 변경 기록 보기 (04 §8.8, 14 §1.4): 항목 하나의 만듦·고침·휴지통·복구 타임라인. 내부 필드명은 화면 이름으로
// ponytail: 지금은 지출(수정 화면)에서만 열고, "이 상태로 되돌리기"는 아직 — 다른 영역은 라벨만 더하면 같은 함수로
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { revisions } from "../db/schema.ts";
import { nameMaps } from "./finance.ts";
import type { Ctx } from "./repo.ts";

const FIELDS: Record<string, Record<string, string>> = {
  transaction: { amount: "금액", currency: "통화", date: "날짜", categoryId: "분류", paymentMethodId: "결제수단", title: "내용", memo: "메모", isRefund: "환불", restraint: "참아서 갚기", tags: "태그", type: "종류", plannedExpenseId: "큰 지출", payId: "페이" },
};
const ACTION = { create: "만듦", update: "고침", delete: "휴지통으로", restore: "복구" } as const;

type Names = Awaited<ReturnType<typeof nameMaps>>;
const show = (names: Names, field: string, v: unknown) => {
  if (v === null || v === undefined || v === "") return "없음";
  if (field === "amount") return `${Number(v).toLocaleString("ko-KR")}원`;
  if (field === "categoryId") return names.categories[String(v)] ?? "지운 분류";
  if (field === "paymentMethodId" || field === "payId") return names.payments[String(v)] ?? "지운 결제수단";
  if (field === "isRefund" || field === "restraint") return v ? "예" : "아니요";
  if (Array.isArray(v)) return v.length ? v.map((t) => `#${t}`).join(" ") : "없음";
  if (field === "type") return v === "income" ? "수입" : "지출";
  if (field === "plannedExpenseId") return "연결됨";
  return String(v);
};

/** 고친 필드를 화면 이름·값으로(라벨이 있는 영역만, 없으면 빈 배열) */
export function changesOf(entity: string, before: unknown, after: unknown, names: Names) {
  const labels = FIELDS[entity];
  if (!labels) return [];
  return Object.keys((after as Record<string, unknown>) ?? {})
    .filter((f) => labels[f])
    .map((f) => ({ label: labels[f], before: show(names, f, (before as Record<string, unknown> | null)?.[f]), after: show(names, f, (after as Record<string, unknown>)[f]) }));
}

export async function historyOf(ctx: Ctx, entity: keyof typeof FIELDS, id: string) {
  const [rows, names] = await Promise.all([
    db
      .select()
      .from(revisions)
      .where(and(eq(revisions.userId, ctx.userId), eq(revisions.entityType, entity), eq(revisions.entityId, id)))
      .orderBy(desc(revisions.createdAt))
      .limit(100),
    nameMaps(ctx),
  ]);
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    action: ACTION[r.action as keyof typeof ACTION] ?? r.action,
    by: r.actor === "user" ? null : "자동",
    changes: r.action === "update" ? changesOf(entity, r.before, r.after, names) : [],
  }));
}
export type HistoryEntry = Awaited<ReturnType<typeof historyOf>>[number];
