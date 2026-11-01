// 생성 요청 멱등성 (docs/planning/15 §2.4): 오프라인 재전송·두 번 탭에도 한 번만 만들어지게
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/index.ts";
import { idempotencyKeys } from "../db/schema.ts";
import { AppError } from "./errors.ts";

/** 멱등 실행: 같은 사용자·키면 저장된 응답, 키는 같은데 내용이 다르면 409 */
export async function once(userId: string, key: string, request: string, run: () => Promise<{ status: number; body: unknown }>) {
  const hash = createHash("sha256").update(request).digest("hex");
  const since = new Date(Date.now() - 24 * 3600_000);
  const [hit] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key), gt(idempotencyKeys.createdAt, since)));
  if (hit) {
    if (hit.requestHash !== hash) throw new AppError("IDEMPOTENCY_MISMATCH", "잠시 후 다시 시도해 주세요");
    return { status: hit.status, body: hit.response };
  }
  const out = await run();
  // ponytail: 동시에 같은 키 두 요청이 오면 둘 다 실행될 수 있음(두 번 탭 수준은 화면에서 막음). 문제가 되면 먼저 키를 잠그는 방식으로
  await db
    .insert(idempotencyKeys)
    .values({ userId, key, requestHash: hash, status: out.status, response: out.body as object })
    .onConflictDoUpdate({ target: [idempotencyKeys.userId, idempotencyKeys.key], set: { requestHash: hash, status: out.status, response: out.body as object, createdAt: new Date() } });
  return out;
}
