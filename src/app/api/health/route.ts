// 서버가 살아 있는지(앱 셸의 "서버에 연결할 수 없어요" 띠, 운영 상태 확인용). 로그인 불필요, 정보 없음
export function GET() {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
