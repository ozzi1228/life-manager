// 커리어 · 경험 보기·고치기(전체 화면)
import { ExperienceEditor } from "@/components/career/experiences";
import { expCategories, getExp } from "@/server/career";
import { pageCtx } from "@/server/session";

export default async function ExperiencePage({ params }: PageProps<"/career/exp/[id]">) {
  const { id } = await params;
  const ctx = await pageCtx();
  return <ExperienceEditor exp={await getExp(ctx, id)} categories={await expCategories(ctx)} />;
}
