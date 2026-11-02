// 문서 파일 받기(커리어): 소유자만. PDF는 브라우저에서 바로 열고, 나머지는 내려받기
import { api } from "@/server/api";
import { readDocFile } from "@/server/files";

export const GET = api("/api/v1/files/:id", async ({ ctx, params }) => {
  const f = await readDocFile(ctx, params.id);
  const disposition = f.mime === "application/pdf" ? "inline" : "attachment";
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime,
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
});
