// 0단계 V-06: 올린 그림을 스프라이트 시트로 바꿔 돌려줌(저장하지 않음)
import { convertPetImage, PetUploadError } from "@/lib/pet-convert";

export async function POST(req: Request) {
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일을 골라 주세요." }, { status: 400 });
  try {
    const r = await convertPetImage(Buffer.from(await file.arrayBuffer()));
    return Response.json({
      sheet: `data:image/webp;base64,${r.sheet.toString("base64")}`,
      bytes: r.sheet.length,
      inputBytes: file.size,
      frames: r.frames,
      fps: r.fps,
      loop: r.loop,
      warnings: r.warnings,
    });
  } catch (e) {
    if (e instanceof PetUploadError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
