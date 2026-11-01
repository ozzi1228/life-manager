// /api/v1 라우트와 Server Action이 함께 쓰는 입구 (docs/planning/15 §1·§2)
// - 세션 사용자로 범위를 정함(요청의 user_id는 받지 않음)
// - 응답 { data, page? } / 오류 { error: { code, message, fields?, request_id } }
// - 생성(POST)은 Idempotency-Key 필수: 같은 키로 다시 오면 첫 응답을 그대로(24시간)
// - API 로그: 경로 템플릿·상태·시간만(본문·쿠키·키는 남기지 않음, 14 §5.1)
import { headers as nextHeaders } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "../db/index.ts";
import { uuidv7 } from "../db/id.ts";
import { apiLogs } from "../db/schema.ts";
import { auth } from "../lib/auth.ts";
import { AppError } from "./errors.ts";
import { once } from "./idempotency.ts";
import type { Ctx } from "./repo.ts";

export const newRequestId = () => `req_${uuidv7().replaceAll("-", "")}`;

async function userFrom(headers: Headers) {
  const s = await auth.api.getSession({ headers });
  return s?.user ?? null;
}

/** zod로 검증. 실패하면 필드별 문구와 함께 VALIDATION_FAILED */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw new AppError("VALIDATION_FAILED", "입력값을 확인해 주세요", {
    fields: r.error.issues.map((i) => ({ path: i.path.join("."), rule: i.code, message: i.message })),
  });
}

function toError(e: unknown, requestId: string) {
  unstable_rethrow(e); // Next 내부 신호(redirect·notFound·미리 그리기 중단)는 오류로 바꾸지 않고 그대로 넘김
  const err = e instanceof AppError ? e : new AppError("INTERNAL", "잠시 후 다시 시도해 주세요");
  if (!(e instanceof AppError)) console.error(`[${requestId}]`, e);
  const { fields, detail, data } = err.extra;
  return { status: err.status, body: { error: { code: err.code, message: err.message, fields, detail, request_id: requestId }, ...(data ? { data } : {}) } };
}

type Handler = (a: { req: Request; ctx: Ctx; params: Record<string, string> }) => Promise<unknown>;

/** Route Handler 감싸기. route는 로그용 경로 템플릿(예: "/api/v1/goals/:id") */
export function api(route: string, handler: Handler) {
  return async (req: Request, rc?: { params?: Promise<Record<string, string>> }) => {
    await connection(); // API는 요청마다 실행(빌드 때 미리 만들어 두지 않음)
    const requestId = newRequestId();
    const started = Date.now();
    let userId: string | null = null;
    let status = 200;
    let body: unknown;
    try {
      const user = await userFrom(req.headers);
      if (!user) throw new AppError("UNAUTHENTICATED", "다시 로그인해 주세요");
      userId = user.id;
      const ctx: Ctx = { userId, actor: "user", requestId };
      const params = (await rc?.params) ?? {};
      if (req.method === "POST") {
        const key = req.headers.get("idempotency-key");
        if (!key) throw new AppError("BAD_REQUEST", "잠시 후 다시 시도해 주세요", { detail: { missing: "Idempotency-Key" } });
        const raw = await req.clone().text();
        ({ status, body } = await once(userId, key, `${req.method} ${route} ${raw}`, async () => ({ status: 201, body: { data: await handler({ req, ctx, params }) } })));
      } else {
        const result = await handler({ req, ctx, params });
        body = result && typeof result === "object" && "page" in result ? result : { data: result };
      }
    } catch (e) {
      ({ status, body } = toError(e, requestId));
    }
    const code = (body as { error?: { code?: string } })?.error?.code ?? null;
    db.insert(apiLogs)
      .values({ requestId, userId, method: req.method, route, status, ms: Date.now() - started, errorCode: code })
      .catch((e) => console.error("api log", e)); // 로그 실패가 응답을 막지 않게
    return Response.json(body, { status, headers: { "x-request-id": requestId } });
  };
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; fields?: { path: string; message: string }[] } };

/** Server Action 감싸기: 같은 세션·오류 규칙. 화면은 결과의 ok로 분기 */
export async function action<T>(run: (ctx: Ctx) => Promise<T>): Promise<ActionResult<T>> {
  const requestId = newRequestId();
  try {
    const user = await userFrom(await nextHeaders());
    if (!user) throw new AppError("UNAUTHENTICATED", "다시 로그인해 주세요");
    return { ok: true, data: await run({ userId: user.id, actor: "user", requestId }) };
  } catch (e) {
    const { error } = toError(e, requestId).body as { error: Extract<ActionResult<T>, { ok: false }>["error"] };
    return { ok: false, error };
  }
}
