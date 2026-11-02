// 커리어 · 문서(이력서·자기소개서·포트폴리오): 버전별 링크·파일
import { Page } from "@/components/app/page-shell";
import { CareerTabs } from "@/components/career/career-tabs";
import { DocList } from "@/components/career/docs";
import { docList } from "@/server/career";
import { pageCtx } from "@/server/session";

export default async function CareerDocsPage() {
  const ctx = await pageCtx();
  return (
    <Page>
      <CareerTabs />
      <DocList docs={await docList(ctx)} />
    </Page>
  );
}
