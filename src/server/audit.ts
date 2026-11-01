// 감사 로그 (docs/planning/14 §1.5): 보안·개인정보 사건. 사용자 데이터 내용·비밀값은 넣지 않음
import { createHash } from "node:crypto";
import { db } from "../db/index.ts";
import { auditLogs } from "../db/schema.ts";

const hashIp = (ip: string | null) => (ip ? createHash("sha256").update(`oona:${ip}`).digest("hex").slice(0, 16) : null);

export async function audit(event: string, o: { userId?: string | null; detail?: Record<string, unknown>; headers?: Headers; requestId?: string } = {}) {
  const ua = o.headers?.get("user-agent") ?? "";
  await db
    .insert(auditLogs)
    .values({
      userId: o.userId ?? null,
      event,
      detail: o.detail ?? null,
      ipHash: hashIp(o.headers?.get("x-forwarded-for")?.split(",")[0].trim() ?? null),
      userAgent: /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : ua ? "기타" : null,
      requestId: o.requestId,
    })
    .catch((e) => console.error("audit log", e));
}
