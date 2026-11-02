// 커리어 · 경험 정리
import { Page } from "@/components/app/page-shell";
import { CareerTabs } from "@/components/career/career-tabs";
import { ExperienceList } from "@/components/career/experiences";
import { expList } from "@/server/career";
import { pageCtx } from "@/server/session";

export default async function CareerPage() {
  const ctx = await pageCtx();
  return (
    <Page>
      <CareerTabs />
      <ExperienceList items={await expList(ctx)} />
    </Page>
  );
}
