// 보안 기록 (04 §8.9): 로그인·로그아웃·비밀번호 변경·기기 로그아웃·영구 삭제. 위치는 모음(IP는 해시만 저장)
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/index.ts";
import { auditLogs } from "../db/schema.ts";
import type { Ctx } from "./repo.ts";

const LABEL: Record<string, string> = {
  "login.password": "아이디로 로그인",
  "login.kakao": "카카오로 로그인",
  "login.naver": "네이버로 로그인",
  "signup.password": "가입",
  logout: "로그아웃",
  "password.change": "비밀번호 변경",
  "session.revoke": "기기 로그아웃",
  "session.revoke_others": "다른 기기 모두 로그아웃",
  "trash.purge": "휴지통 영구 삭제",
};
export const eventLabel = (e: string) => (e.endsWith(".failed") ? `${LABEL[e.slice(0, -7)] ?? e.slice(0, -7)} 실패` : (LABEL[e] ?? e));

/** 최근 것부터 50개씩. before: 이전 페이지 마지막 시각 */
export async function securityLog(ctx: Ctx, before?: string) {
  const rows = await db
    .select({ id: auditLogs.id, event: auditLogs.event, device: auditLogs.userAgent, at: auditLogs.createdAt, detail: auditLogs.detail })
    .from(auditLogs)
    .where(and(eq(auditLogs.userId, ctx.userId), before ? lt(auditLogs.createdAt, new Date(before)) : undefined))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);
  return rows.map((r) => ({ id: r.id, label: eventLabel(r.event), failed: r.event.endsWith(".failed"), device: r.device, at: r.at.toISOString(), detail: r.event === "trash.purge" ? `${(r.detail as { rows?: number })?.rows ?? 0}개${(r.detail as { reason?: string })?.reason === "retention" ? " · 보관 기간 지남" : ""}` : null }));
}
export type SecurityEntry = Awaited<ReturnType<typeof securityLog>>[number];
