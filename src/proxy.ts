// 로그인 안 한 사람은 앱 화면 대신 로그인으로 (쿠키가 있는지만 빠르게 봄 — 진짜 확인은 (app)/layout의 세션 조회)
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (getSessionCookie(req, { cookiePrefix: "oona" })) return NextResponse.next();
  const url = new URL("/login", req.url);
  const back = req.nextUrl.pathname + req.nextUrl.search;
  if (back !== "/") url.searchParams.set("next", back);
  return NextResponse.redirect(url);
}

// 로그인 없이 열리는 곳: 로그인·가입·비밀번호 찾기·오프라인 안내, API(각자 401), 시험 화면, 정적 파일·아이콘·펫 그림·서비스 워커·매니페스트
export const config = {
  matcher: ["/((?!login|signup|forgot-password|reset-password|offline|api|dev|_next|icons|pets|sw\\.js|manifest\\.webmanifest|icon\\.png|apple-icon\\.png|favicon).*)"],
};
