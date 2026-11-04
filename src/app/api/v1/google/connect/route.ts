// 구글 캘린더 연동 시작: 구글 동의 화면으로 보냄(state는 쿠키로 확인, 10분)
import { randomBytes } from "node:crypto";
import { api } from "@/server/api";
import { authUrl, googleEnabled } from "@/server/google-calendar";

export const GET = api("/api/v1/google/connect", async () => {
  if (!googleEnabled()) return Response.redirect(`${process.env.BETTER_AUTH_URL}/calendar?google=off`, 302);
  const state = randomBytes(16).toString("base64url");
  return new Response(null, {
    status: 302,
    headers: { location: authUrl(state), "set-cookie": `oona_google_state=${state}; Path=/api/v1/google; HttpOnly; SameSite=Lax; Max-Age=600${process.env.BETTER_AUTH_URL?.startsWith("https") ? "; Secure" : ""}` },
  });
});
