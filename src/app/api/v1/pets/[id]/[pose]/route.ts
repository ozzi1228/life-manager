// 내 펫 그림 한 장: 소유자만(로그인 쿠키). 없는 동작은 idle
import { api } from "@/server/api";
import { petImage } from "@/server/pets";

export const GET = api("/api/v1/pets/:id/:pose", async ({ ctx, params }) => {
  const data = await petImage(ctx, params.id, params.pose);
  // 본인만 보는 그림: 공유 캐시 금지. 그림을 바꾸면 펫을 새로 만듦(id가 바뀜)
  return new Response(new Uint8Array(data), { headers: { "content-type": "image/png", "cache-control": "private, max-age=604800, immutable" } });
});
