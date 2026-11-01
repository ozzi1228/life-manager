// 사진 올리기 (15 §2.9를 본인 PC 운영에 맞춰 한 번에): multipart file → 처리·저장 → { id, width, height }
import { AppError } from "@/server/errors";
import { api } from "@/server/api";
import { saveImage } from "@/server/files";

export const POST = api("/api/v1/uploads", async ({ req, ctx }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("BAD_REQUEST", "사진을 골라 주세요");
  return saveImage(ctx, Buffer.from(await file.arrayBuffer()), "journal_photo");
});
