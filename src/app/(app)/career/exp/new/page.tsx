// 커리어 · 경험 추가(전체 화면)
import { ExperienceEditor } from "@/components/career/experiences";
import { expCategories } from "@/server/career";
import { pageCtx } from "@/server/session";

export default async function NewExperiencePage() {
  const ctx = await pageCtx();
  return <ExperienceEditor categories={await expCategories(ctx)} />;
}
