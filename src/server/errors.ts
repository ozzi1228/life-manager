// 서비스·API 공통 오류 (docs/planning/15 §2.2). message는 화면에 그대로 써도 되는 한국어
export type ErrorCode =
  | "VALIDATION_FAILED"
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "DUPLICATE"
  | "IDEMPOTENCY_MISMATCH"
  | "BUSINESS_RULE"
  | "RATE_LIMITED"
  | "UPSTREAM_FAILED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  DUPLICATE: 409,
  IDEMPOTENCY_MISMATCH: 409,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  UPSTREAM_FAILED: 502,
  INTERNAL: 500,
};

export type FieldError = { path: string; rule: string; message: string };

type Extra = { fields?: FieldError[]; detail?: Record<string, unknown>; data?: unknown };

// 매개변수 속성(readonly code 등) 대신 직접 대입: 노드가 타입만 지우고 바로 실행하는 scripts/*.mts에서도 쓰이게
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly extra: Extra;
  constructor(code: ErrorCode, message: string, extra: Extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
    this.status = STATUS[code];
  }
}

export const notFound = () => new AppError("NOT_FOUND", "찾을 수 없어요");
// 409 응답에 최신 값을 함께 줌 → 화면에서 "다른 기기에서 먼저 수정했어요"
export const versionConflict = (latest: unknown) => new AppError("VERSION_CONFLICT", "다른 기기에서 먼저 수정했어요", { data: latest });
