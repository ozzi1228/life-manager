// 사진·문서 올리기 (15 §2.9를 본인 PC 운영에 맞춰 한 번에): multipart file(+purpose) → 처리·저장 → 사진 { id, width, height } / 문서 { id, name, bytes }
import { AppError } from "@/server/errors";
import { api } from "@/server/api";
import { PURPOSES, saveFile, saveImage } from "@/server/files";

export const POST = api("/api/v1/uploads", async ({ req, ctx }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("BAD_REQUEST", "사진을 골라 주세요");
  const purpose = PURPOSES.find((p) => p === form?.get("purpose")) ?? "journal_photo";
  const buf = Buffer.from(await file.arrayBuffer());
  // 커리어 문서(PDF·Word·PPT·한글)는 그대로 보관, 나머지는 사진으로 처리
  return purpose === "career_file" ? saveFile(ctx, buf, file.name) : saveImage(ctx, buf, purpose);
});
