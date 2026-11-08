// 입력 검증(zod) → 실패하면 필드별 문구와 함께 VALIDATION_FAILED (15 §2.2). 서버 쪽 모든 입력의 신뢰 경계
import { z } from "zod";
import { AppError } from "./errors.ts";

/** zod로 검증. 실패하면 필드별 문구와 함께 VALIDATION_FAILED */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw new AppError("VALIDATION_FAILED", "입력값을 확인해 주세요", {
    fields: r.error.issues.map((i) => ({ path: i.path.join("."), rule: i.code, message: i.message })),
  });
}

/** 검색어 → ILIKE 패턴(% _ \ 는 글자 그대로) */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
