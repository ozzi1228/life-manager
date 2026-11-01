// 내 펫 목록(본인만). 기본 펫은 앱 정적 파일(PRESET_PETS)
import { api } from "@/server/api";
import { myPets } from "@/server/pets";

export const GET = api("/api/v1/pets", async ({ ctx }) => myPets(ctx));
