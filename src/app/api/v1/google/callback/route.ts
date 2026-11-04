// 구글 캘린더 연동 콜백: state 확인 → 토큰 저장·첫 가져오기 → 일정 화면으로(?google=connected|denied|error)
import { api } from "@/server/api";
import { connectGoogle } from "@/server/google-calendar";

export const GET = api("/api/v1/google/callback", async ({ req, ctx }) => {
  const url = new URL(req.url);
  const state = req.headers.get("cookie")?.match(/(?:^|;\s*)oona_google_state=([^;]+)/)?.[1];
  const code = url.searchParams.get("code");
  let result = "connected";
  if (url.searchParams.get("error")) result = "denied";
  else if (!code || !state || state !== url.searchParams.get("state")) result = "error";
  else await connectGoogle(ctx, code).catch((e) => ((result = "error"), console.error("google connect", e)));
  return new Response(null, { status: 302, headers: { location: `${process.env.BETTER_AUTH_URL}/calendar?google=${result}`, "set-cookie": "oona_google_state=; Path=/api/v1/google; Max-Age=0" } });
});
