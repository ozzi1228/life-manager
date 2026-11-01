// 사진 보기: 소유자만(로그인 쿠키). ?v=thumb|body
import { api } from "@/server/api";
import { readImage } from "@/server/files";

export const GET = api("/api/v1/attachments/:id", async ({ req, ctx, params }) => {
  const v = new URL(req.url).searchParams.get("v") === "thumb" ? "thumb" : "body";
  const data = await readImage(ctx, params.id, v);
  // 본인만 보는 사진: 공유 캐시 금지, 기기 캐시는 하루(파일은 바뀌지 않음)
  return new Response(new Uint8Array(data), { headers: { "content-type": "image/webp", "cache-control": "private, max-age=86400, immutable" } });
});
